import { DEFAULT_TITLE } from '@swv/core';

import { useDiagramStore } from '../../shared/state/diagramStore.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { useNotesStore } from '../../shared/state/notesStore.ts';
import { measureLive, type LiveGeometry } from './liveGeometry.ts';
import { pdfTablePages } from './pdfTable.ts';
import { context2d, makeCanvas, rasterize } from './raster.ts';
import { diagramSvgString } from './svgExport.ts';

/**
 * Landscape pages: the diagram cut between arrows, the participant row repeated on every page
 * after the first, then the step table. Everything is drawn on canvases first, so any character
 * in the flow prints as the page shows it.
 */

export type PaperSize = 'a4' | 'letter';

export interface PdfOptions {
  size: PaperSize;
  /** Adds the step table at the end. */
  table: boolean;
  /** Adds the Your note column to the table. */
  notes: boolean;
}

export interface PdfPlan {
  page: { w: number; h: number };
  margin: number;
  titleH: number;
  footH: number;
  cw: number;
  ch: number;
  /** Millimetres per diagram unit. */
  mm: number;
  /** [top, bottom] of each page's slice in diagram units. */
  slices: [number, number][];
  /** [hdrTop, hdrH] when the participant row is repeated. */
  hdr: [number, number] | null;
}

export function pdfPlan(size: PaperSize, width: number, height: number, geo: LiveGeometry | null): PdfPlan {
  const page = size === 'letter' ? { w: 279.4, h: 215.9 } : { w: 297, h: 210 };
  const margin = 10;
  const titleH = 9;
  const footH = 6;
  const cw = page.w - 2 * margin;
  const ch = page.h - 2 * margin - titleH - footH;
  const mm = Math.min(cw / Math.max(1, width), 0.4);
  const hdrH = geo?.hdrH ?? 0;
  const boxes = geo?.boxes ?? [];
  // Safe places to cut: the gaps between arrows, so no label is split.
  const cuts = boxes
    .slice(0, -1)
    .flatMap((b, i) => {
      const next = boxes[i + 1];
      return next ? [(b.y + b.h + next.y) / 2] : [];
    })
    .sort((a, b) => a - b);
  const slices: [number, number][] = [];
  let y = 0;
  while (y < height - 0.5) {
    const room = ch / mm - (slices.length && geo ? hdrH : 0);
    let end = Math.min(height, y + room);
    if (end < height) {
      const inRange = cuts.filter((c) => c > y + room * 0.4 && c <= end);
      const last = inRange[inRange.length - 1];
      if (last !== undefined) end = last;
    }
    slices.push([y, end]);
    y = end;
  }
  return { page, margin, titleH, footH, cw, ch, mm, slices, hdr: geo ? [geo.hdrTop, hdrH] : null };
}

/** The participant row and arrow boxes of the drawn diagram, when a sequence diagram is shown. */
export function liveGeometry(): LiveGeometry | null {
  const { flow } = useFlowStore.getState();
  const live = useDiagramStore.getState().commands.svgElement();
  return flow?.isSequence && live ? measureLive(live) : null;
}

function pageLabel(plan: PdfPlan, text: string, pageNo: number, total: number): HTMLCanvasElement {
  const pxmm = 6;
  const c = makeCanvas(plan.cw * pxmm, plan.titleH * pxmm);
  const x = context2d(c);
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#161d29';
  x.font = `700 ${4.2 * pxmm}px Recursive, sans-serif`;
  x.textBaseline = 'middle';
  x.fillText(text, 0, c.height / 2);
  x.fillStyle = '#566072';
  x.font = `500 ${3.2 * pxmm}px Recursive, sans-serif`;
  x.textAlign = 'right';
  x.fillText(`Page ${pageNo} of ${total}`, c.width, c.height / 2);
  return c;
}

export interface PdfResult {
  blob: Blob;
  pages: number;
  diagramPages: number;
  tablePages: number;
}

/** Builds the PDF; null when nothing has been drawn yet. */
export async function makePdf(options: PdfOptions): Promise<PdfResult | null> {
  const diagram = useDiagramStore.getState();
  const { flow } = useFlowStore.getState();
  const svgText = await diagramSvgString();
  if (!svgText) return null;
  await Promise.all(
    ['400', '500', '600', '700', '750'].map((w) => document.fonts.load(`${w} 16px Recursive`).catch(() => null)),
  );
  const { width: W, height: H, themeBg } = diagram;
  const plan = pdfPlan(options.size, W, H, liveGeometry());
  const { canvas, scale } = await rasterize(svgText, W, H, 2, themeBg);
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: options.size, compress: true });
  const title = flow?.title ?? DEFAULT_TITLE;
  const notes = useNotesStore.getState();
  const tablePages =
    flow?.isSequence && options.table
      ? pdfTablePages(plan, flow, options.notes ? (step) => notes.entry(step) : undefined)
      : [];
  const total = plan.slices.length + tablePages.length;

  plan.slices.forEach(([y0, y1], i) => {
    if (i) doc.addPage();
    const hdr = i > 0 ? plan.hdr : null;
    const hh = hdr ? hdr[1] : 0;
    const pc = makeCanvas(canvas.width, (hh + y1 - y0) * scale);
    const x = context2d(pc);
    x.fillStyle = themeBg;
    x.fillRect(0, 0, pc.width, pc.height);
    if (hdr) {
      x.drawImage(canvas, 0, hdr[0] * scale, canvas.width, hh * scale, 0, 0, pc.width, hh * scale);
      x.fillStyle = 'rgba(0,0,0,.12)';
      x.fillRect(0, hh * scale - 2, pc.width, 2);
    }
    x.drawImage(canvas, 0, y0 * scale, canvas.width, (y1 - y0) * scale, 0, hh * scale, pc.width, (y1 - y0) * scale);
    const label = pageLabel(plan, title + (i ? ' (continued)' : ''), i + 1, total);
    doc.addImage(label, 'PNG', plan.margin, plan.margin, plan.cw, plan.titleH, undefined, 'FAST');
    doc.addImage(pc, 'PNG', plan.margin, plan.margin + plan.titleH, W * plan.mm, (hh + y1 - y0) * plan.mm, undefined, 'FAST');
  });
  tablePages.forEach((tc, j) => {
    doc.addPage();
    const label = pageLabel(plan, `${title} – steps`, plan.slices.length + j + 1, total);
    doc.addImage(label, 'PNG', plan.margin, plan.margin, plan.cw, plan.titleH, undefined, 'FAST');
    doc.addImage(tc, 'PNG', plan.margin, plan.margin + plan.titleH, plan.cw, plan.ch, undefined, 'FAST');
  });
  return { blob: doc.output('blob'), pages: total, diagramPages: plan.slices.length, tablePages: tablePages.length };
}
