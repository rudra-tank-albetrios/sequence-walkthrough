import { context2d, makeCanvas } from '../../../shared/lib/raster.ts';
import type { DocBlock } from './blocks.ts';
import { FONTS, layoutPages, type FontName, type Measure, type PdfPage, type Tone } from './pdfLayout.ts';

/**
 * The PDF. Text is drawn on a canvas, so any character prints correctly (the fonts built into
 * PDF have only Latin letters), and an invisible copy of each line goes on top, so the file can be
 * searched and its text selected. The paper is white whatever the theme of the page.
 */

const PIXELS_PER_MM = 7.2;
const POINTS_PER_MM = 2.835;
const SANS = 'Recursive, sans-serif';
const MONO = '"Cascadia Mono", Consolas, monospace';
const TONES: Record<Tone, string> = { ink: '#161d29', muted: '#566072', ok: '#217a3c' };
const RULE = '#d5dbe3';

function cssFont(name: FontName): string {
  const font = FONTS[name];
  return `${font.weight} ${font.size * PIXELS_PER_MM}px ${font.mono ? MONO : SANS}`;
}

function canvasMeasure(): Measure {
  const ctx = context2d(makeCanvas(1, 1));
  return (text, font) => {
    ctx.font = cssFont(font);
    return ctx.measureText(text).width / PIXELS_PER_MM;
  };
}

function drawPage(page: PdfPage): HTMLCanvasElement {
  const canvas = makeCanvas(page.width * PIXELS_PER_MM, page.height * PIXELS_PER_MM);
  const ctx = context2d(canvas);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = 'top';
  for (const item of page.items) {
    if (item.kind === 'rule') {
      ctx.fillStyle = RULE;
      ctx.fillRect(item.x * PIXELS_PER_MM, item.y * PIXELS_PER_MM, item.width * PIXELS_PER_MM, 2);
    } else {
      ctx.font = cssFont(item.font);
      ctx.fillStyle = TONES[item.tone];
      ctx.fillText(item.text, item.x * PIXELS_PER_MM, item.y * PIXELS_PER_MM);
    }
  }
  return canvas;
}

const FOLDED: Readonly<Record<string, string>> = {
  '→': '->',
  '←': '<-',
  '↔': '<->',
  '–': '-',
  '—': '-',
  '−': '-',
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '…': '...',
  '₹': 'Rs ',
  '€': 'EUR ',
  '•': '-',
};

/** The invisible copy uses a PDF font, which has only Latin-1 letters. */
export function latinText(text: string): string {
  return text.replace(/[^\x20-\x7e\xa0-\xff]/g, (char) => FOLDED[char] ?? '?');
}

/** The PDF of these blocks. jsPDF loads only now, when a PDF is first asked for. */
export async function blocksToPdf(title: string, blocks: readonly DocBlock[]): Promise<Blob> {
  const text = JSON.stringify(blocks.filter((block) => block.kind !== 'image'));
  const weights = new Set(Object.values(FONTS).map((font) => font.weight));
  await Promise.all(
    [...weights].map((weight) => document.fonts.load(`${weight} 16px Recursive`, text).catch(() => null)),
  );
  const pages = layoutPages(blocks, canvasMeasure());
  const { jsPDF } = await import('jspdf');
  const first = pages[0] ?? { width: 210, height: 297 };
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [first.width, first.height],
    compress: true,
  });
  doc.setProperties({ title: latinText(title) });
  pages.forEach((page, index) => {
    if (index > 0) doc.addPage([page.width, page.height], 'portrait');
    if (page.image) {
      doc.addImage(page.image.dataUrl, 'PNG', 0, 0, page.width, page.height, undefined, 'FAST');
      doc.setFontSize(10);
      doc.text(latinText(page.image.alt), 4, 4, { baseline: 'top', renderingMode: 'invisible' });
      return;
    }
    doc.addImage(drawPage(page), 'PNG', 0, 0, page.width, page.height, undefined, 'FAST');
    for (const item of page.items) {
      if (item.kind !== 'text' || !item.text.trim()) continue;
      doc.setFontSize(FONTS[item.font].size * POINTS_PER_MM);
      doc.text(latinText(item.text), item.x, item.y, { baseline: 'top', renderingMode: 'invisible' });
    }
  });
  return doc.output('blob');
}
