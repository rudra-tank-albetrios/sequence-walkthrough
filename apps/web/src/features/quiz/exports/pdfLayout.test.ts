import { describe, expect, it } from 'vitest';

import type { DocBlock } from './blocks.ts';
import { FONTS, layoutPages, wrapText, type Measure, type PdfPage, type TextItem } from './pdfLayout.ts';

/** Every character is half as wide as its font is high, near enough for a layout. */
const measure: Measure = (text, font) => text.length * FONTS[font].size * 0.5;

const LEFT = 16;
const RIGHT = 194;
const BOTTOM = 281;

const textsOf = (page: PdfPage | undefined): TextItem[] =>
  (page?.items ?? []).filter((item): item is TextItem => item.kind === 'text');
const allText = (pages: readonly PdfPage[]): string =>
  pages.flatMap((page) => textsOf(page).map((item) => item.text)).join(' ');

function expectInside(pages: readonly PdfPage[]): void {
  for (const page of pages) {
    for (const item of textsOf(page)) {
      expect(item.x).toBeGreaterThanOrEqual(LEFT);
      expect(item.x + measure(item.text, item.font)).toBeLessThanOrEqual(RIGHT + 0.001);
      expect(item.y + FONTS[item.font].size).toBeLessThanOrEqual(BOTTOM);
    }
  }
}

const question = (number: number, text = 'Which layer answers?'): DocBlock => ({
  kind: 'question',
  number,
  text,
  meta: 'Step 1',
});

describe('wrapping text', () => {
  it('keeps words whole and lines within the width', () => {
    const lines = wrapText('one two three four five six', 'body', 20, measure);
    expect(lines.join(' ')).toBe('one two three four five six');
    for (const line of lines) expect(measure(line, 'body')).toBeLessThanOrEqual(20);
    expect(lines.length).toBeGreaterThan(1);
  });

  it('cuts a word wider than the line, and loses nothing', () => {
    const word = 'x'.repeat(200);
    const lines = wrapText(`before ${word} after`, 'body', 30, measure);
    expect(lines.join('').replace(/ /g, '')).toBe(`before${word}after`);
    for (const line of lines) expect(measure(line, 'body')).toBeLessThanOrEqual(30);
  });

  it('gives one empty line for no text', () => {
    expect(wrapText('   ', 'body', 30, measure)).toEqual(['']);
  });
});

describe('laying out pages', () => {
  it('moves on to a new A4 page when one is full, in order', () => {
    const blocks = Array.from({ length: 60 }, (_, i) => question(i + 1));
    const pages = layoutPages(blocks, measure);
    expect(pages.length).toBeGreaterThan(1);
    expectInside(pages);
    for (const page of pages) expect([page.width, page.height]).toEqual([210, 297]);
    const numbers = allText(pages)
      .match(/\d+\. Which/g)
      ?.map((text) => parseInt(text, 10));
    expect(numbers).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
  });

  it('keeps every long text inside the page and loses none of it', () => {
    const long = 'word '.repeat(600).trim();
    const pages = layoutPages(
      [
        { kind: 'title', text: long },
        { kind: 'text', text: long },
        question(1, long),
        { kind: 'option', text: long, correct: true },
        { kind: 'fact', label: 'Reason', text: long },
      ],
      measure,
    );
    expectInside(pages);
    expect(allText(pages).match(/word/g)).toHaveLength(600 * 5);
  });

  it('does not leave a heading alone at the foot of a page', () => {
    for (let lines = 40; lines < 100; lines++) {
      const before: DocBlock = { kind: 'code', language: '', text: 'x\n'.repeat(lines) };
      const pages = layoutPages(
        [before, { kind: 'heading', text: 'A heading' }, { kind: 'text', text: 'Body' }],
        measure,
      );
      const page = pages.find((candidate) => textsOf(candidate).some((item) => item.text === 'A heading'));
      expect(textsOf(page).some((item) => item.text === 'Body')).toBe(true);
    }
  });

  it('draws a table with its cells in columns and a rule under each row', () => {
    const [page] = layoutPages(
      [{ kind: 'table', head: ['Chapter', 'Score'], rows: [['Reply', '1 of 2']] }],
      measure,
    );
    const cells = textsOf(page);
    expect(cells.map((item) => item.text)).toEqual(['Chapter', 'Score', 'Reply', '1 of 2']);
    expect(cells[0]?.y).toBe(cells[1]?.y);
    expect(cells[1]?.x).toBeGreaterThan(cells[0]?.x ?? 0);
    expect(page?.items.filter((item) => item.kind === 'rule')).toHaveLength(2);
  });

  it('keeps the indentation and blank lines of code, and cuts long lines', () => {
    const code = `first\n\n    indented\n${'y'.repeat(300)}`;
    const pages = layoutPages([{ kind: 'code', language: 'mermaid', text: code }], measure);
    expectInside(pages);
    const lines = textsOf(pages[0]).map((item) => item.text);
    expect(lines.slice(0, 3)).toEqual(['first', '', '    indented']);
    expect(lines.slice(3).join('')).toBe('y'.repeat(300));
  });

  it('gives an image a page of its size, and the text goes on after it', () => {
    const pages = layoutPages(
      [
        { kind: 'text', text: 'Before' },
        { kind: 'image', alt: 'A diagram', dataUrl: 'data:,', width: 1000, height: 2000 },
        { kind: 'text', text: 'After' },
      ],
      measure,
    );
    expect(pages).toHaveLength(3);
    expect(pages[1]).toMatchObject({ width: 297, height: 594, image: { alt: 'A diagram' } });
    expect(textsOf(pages[2]).map((item) => item.text)).toEqual(['After']);
  });

  it('keeps a very tall image within what a PDF page may be', () => {
    const [page] = layoutPages(
      [{ kind: 'image', alt: 'Tall', dataUrl: 'data:,', width: 1000, height: 100_000 }],
      measure,
    );
    expect(page?.height).toBe(5000);
    expect(page?.width).toBeCloseTo(50);
  });
});
