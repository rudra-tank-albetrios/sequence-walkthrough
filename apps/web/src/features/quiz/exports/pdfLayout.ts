import type { DocBlock } from './blocks.ts';

/** Where everything goes on the pages of a PDF, in millimetres. Pure, so tests can run it. */

const A4 = { width: 210, height: 297, margin: 16 } as const;
const CONTENT = A4.width - 2 * A4.margin;
const OPTION_INDENT = 6;
const FACT_INDENT = 2;
const CELL_GAP = 3;

/** A tall diagram gets one tall page, at most this high: the PDF format stops at 5,080 mm. */
const IMAGE_PAGE = { width: 297, maxHeight: 5000 } as const;

export const FONTS = {
  title: { size: 7, weight: 700, mono: false },
  heading: { size: 5.2, weight: 700, mono: false },
  question: { size: 4, weight: 650, mono: false },
  body: { size: 3.7, weight: 400, mono: false },
  bold: { size: 3.7, weight: 650, mono: false },
  small: { size: 3.2, weight: 400, mono: false },
  code: { size: 2.9, weight: 400, mono: true },
} as const;

export type FontName = keyof typeof FONTS;
export type Tone = 'ink' | 'muted' | 'ok';

/** The width of a text in this font, in millimetres. */
export type Measure = (text: string, font: FontName) => number;

export interface TextItem {
  kind: 'text';
  text: string;
  x: number;
  y: number;
  font: FontName;
  tone: Tone;
}

interface RuleItem {
  kind: 'rule';
  x: number;
  y: number;
  width: number;
}

export interface PdfPage {
  width: number;
  height: number;
  items: (TextItem | RuleItem)[];
  /** A page that is only this image, edge to edge. */
  image?: { alt: string; dataUrl: string };
}

const lineHeight = (font: FontName): number => FONTS[font].size * 1.38;

/** Cuts a word that is wider than the column. */
function breakWord(word: string, font: FontName, width: number, measure: Measure): string[] {
  const parts: string[] = [];
  let part = '';
  for (const char of word) {
    if (part && measure(part + char, font) > width) {
      parts.push(part);
      part = '';
    }
    part += char;
  }
  if (part) parts.push(part);
  return parts;
}

/** The lines of a text in this width. Words stay whole unless one alone is too wide. */
export function wrapText(text: string, font: FontName, width: number, measure: Measure): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate, font) <= width) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    const parts = breakWord(word, font, width, measure);
    line = parts.pop() ?? '';
    lines.push(...parts);
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [''];
}

function imagePageSize(pixelWidth: number, pixelHeight: number): { width: number; height: number } {
  const height = (IMAGE_PAGE.width * pixelHeight) / Math.max(1, pixelWidth);
  if (height <= IMAGE_PAGE.maxHeight) return { width: IMAGE_PAGE.width, height };
  return {
    width: (IMAGE_PAGE.maxHeight * pixelWidth) / Math.max(1, pixelHeight),
    height: IMAGE_PAGE.maxHeight,
  };
}

/** Writes lines from the top of A4 pages down, starting a page when one is full. */
class PageWriter {
  readonly pages: PdfPage[] = [];
  private page: PdfPage | null = null;
  private y: number = A4.margin;
  private readonly measure: Measure;

  constructor(measure: Measure) {
    this.measure = measure;
  }

  /** The current page, or a new one when this much height does not fit on it. */
  private room(height: number): PdfPage {
    if (!this.page || this.y + height > A4.height - A4.margin) {
      this.page = { width: A4.width, height: A4.height, items: [] };
      this.pages.push(this.page);
      this.y = A4.margin;
    }
    return this.page;
  }

  private line(text: string, font: FontName, x: number, tone: Tone): void {
    const height = lineHeight(font);
    this.room(height).items.push({ kind: 'text', text, x, y: this.y, font, tone });
    this.y += height;
  }

  /** Keeps what follows together: a heading is not left alone at the foot of a page. */
  keep(height: number, gapAbove: number): void {
    this.room(height + gapAbove);
    if (this.y > A4.margin) this.y += gapAbove;
  }

  paragraph(text: string, font: FontName, x: number, tone: Tone, after: number): void {
    const width = A4.width - A4.margin - x;
    for (const each of wrapText(text, font, width, this.measure)) this.line(each, font, x, tone);
    this.y += after;
  }

  question(label: string, meta: string): void {
    const lines = wrapText(label, 'question', CONTENT, this.measure).length;
    this.keep(lines * lineHeight('question') + lineHeight('small') + 2 * lineHeight('body'), 3);
    this.paragraph(label, 'question', A4.margin, 'ink', 0.4);
    this.paragraph(meta, 'small', A4.margin, 'muted', 1.2);
  }

  /** The label goes above its text: one line of the canvas has one font. */
  fact(label: string, text: string): void {
    const x = A4.margin + FACT_INDENT;
    this.keep(lineHeight('bold') + lineHeight('body'), 0);
    this.line(`${label}:`, 'bold', x, 'muted');
    this.paragraph(text, 'body', x, 'ink', 1.4);
  }

  /** The first column is the widest, and a row stays on one page. */
  table(head: readonly string[], rows: readonly (readonly string[])[]): void {
    const others = CONTENT / (Math.max(1, head.length) + 1);
    const first = CONTENT - others * (head.length - 1);
    const row = (cells: readonly string[], font: FontName, tone: Tone): void => {
      const wrapped = cells.map((cell, index) =>
        wrapText(cell, font, (index === 0 ? first : others) - CELL_GAP, this.measure),
      );
      const height = Math.max(...wrapped.map((lines) => lines.length)) * lineHeight(font) + 1.2;
      const target = this.room(height);
      wrapped.forEach((lines, index) => {
        const x = A4.margin + (index === 0 ? 0 : first + others * (index - 1));
        lines.forEach((text, n) => {
          target.items.push({ kind: 'text', text, x, y: this.y + n * lineHeight(font), font, tone });
        });
      });
      this.y += height;
      target.items.push({ kind: 'rule', x: A4.margin, y: this.y - 0.4, width: CONTENT });
    };
    row(head, 'bold', 'muted');
    for (const cells of rows) row(cells, 'body', 'ink');
    this.y += 2;
  }

  /** Code keeps its indentation and breaks by character. */
  code(text: string): void {
    for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
      const parts = raw.trim() ? breakWord(raw, 'code', CONTENT, this.measure) : [''];
      for (const part of parts) this.line(part, 'code', A4.margin, 'ink');
    }
  }

  /** An image has a page of its own, the size of the image. The text goes on after it. */
  image(alt: string, dataUrl: string, width: number, height: number): void {
    this.pages.push({ ...imagePageSize(width, height), items: [], image: { alt, dataUrl } });
    this.page = null;
  }
}

/** Lays the blocks out on A4 pages. */
export function layoutPages(blocks: readonly DocBlock[], measure: Measure): PdfPage[] {
  const writer = new PageWriter(measure);
  const left = A4.margin;
  for (const block of blocks) {
    switch (block.kind) {
      case 'title':
        writer.paragraph(block.text, 'title', left, 'ink', 2.5);
        break;
      case 'heading':
        writer.keep(lineHeight('heading') + 3 * lineHeight('body'), 2);
        writer.paragraph(block.text, 'heading', left, 'ink', 1.5);
        break;
      case 'text':
        writer.paragraph(block.text, 'body', left, 'ink', 1.5);
        break;
      case 'question':
        writer.question(`${block.number}. ${block.text}`, block.meta);
        break;
      case 'option':
        writer.paragraph(
          `${block.correct ? '[x]' : '[  ]'} ${block.text}`,
          block.correct ? 'bold' : 'body',
          left + OPTION_INDENT,
          block.correct ? 'ok' : 'ink',
          0.6,
        );
        break;
      case 'fact':
        writer.fact(block.label, block.text);
        break;
      case 'table':
        writer.table(block.head, block.rows);
        break;
      case 'code':
        writer.code(block.text);
        break;
      case 'image':
        writer.image(block.alt, block.dataUrl, block.width, block.height);
        break;
    }
  }
  return writer.pages;
}
