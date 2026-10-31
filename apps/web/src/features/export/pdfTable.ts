import type { Flow, Step } from '@swv/core';

import { route } from '../../shared/storage/notes.ts';
import type { PdfPlan } from './pdf.ts';
import { context2d, makeCanvas } from '../../shared/lib/raster.ts';
import type { NoteLookup } from '../../shared/lib/stepTable.ts';

/** The step table drawn on canvas pages for the PDF, so any character prints correctly. */

const INK = '#161d29';
const MUTED = '#566072';
const FAINT = '#8a93a3';
const SANS = 'Recursive, sans-serif';
const MONO = '"Cascadia Mono", Consolas, monospace';

interface Piece {
  text: string;
  font: string;
  color?: string;
}

interface Column {
  key: 'n' | 'route' | 'sends' | 'does' | 'note';
  w: number;
  head: string;
}

function columns(withNotes: boolean): Column[] {
  const cols: Column[] = [
    { key: 'n', w: 0.05, head: '#' },
    { key: 'route', w: 0.2, head: 'From → To' },
    { key: 'sends', w: 0.27, head: 'Sends' },
    { key: 'does', w: withNotes ? 0.3 : 0.48, head: 'Does' },
  ];
  if (withNotes) cols.push({ key: 'note', w: 0.18, head: 'Your note' });
  return cols;
}

function cellsOf(step: Step, notes: NoteLookup | undefined): Record<Column['key'], Piece[]> {
  const entry = notes?.(step);
  const branch = step.branch.length
    ? ` · ${step.branch.map((b) => `${b.kind} ${b.label}`.trim()).join(' > ')}`
    : '';
  return {
    n: [{ text: String(step.n), font: `600 11px ${SANS}` }],
    route: [
      { text: route(step), font: `600 11px ${SANS}` },
      { text: step.kind + branch, font: `400 10px ${SANS}`, color: MUTED },
    ],
    sends: [{ text: step.label.join('\n'), font: `400 10.5px ${MONO}` }],
    does: [
      { text: step.explain || 'No explanation', font: `400 11px ${SANS}`, color: step.explain ? INK : FAINT },
      ...(step.payload ? [{ text: `Payload: ${step.payload}`, font: `400 10px ${MONO}`, color: MUTED }] : []),
      ...(step.refs.length ? [{ text: step.refs.join('  '), font: `400 10px ${MONO}`, color: MUTED }] : []),
    ],
    note: [{ text: `${entry?.star ? '★ ' : ''}${entry?.note ?? ''}`, font: `400 11px ${SANS}` }],
  };
}

export function pdfTablePages(plan: PdfPlan, flow: Flow, notes?: NoteLookup): HTMLCanvasElement[] {
  const pxmm = 3.6;
  const u = 2.5; // 11px text prints at about 9pt; drawn at 2.5x for sharp print
  const W = Math.round(plan.cw * pxmm);
  const H = Math.round(plan.ch * pxmm);
  const cols = columns(notes !== undefined);
  const pages: HTMLCanvasElement[] = [];
  let y = 0;

  const newPage = (): CanvasRenderingContext2D => {
    const c = makeCanvas(W * u, H * u);
    const ctx = context2d(c);
    ctx.scale(u, u);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'top';
    y = 0;
    ctx.font = `700 11px ${SANS}`;
    ctx.fillStyle = MUTED;
    let cx = 0;
    for (const col of cols) {
      ctx.fillText(col.head, cx + 4, y + 4);
      cx += col.w * W;
    }
    y += 22;
    ctx.fillStyle = '#d5dbe3';
    ctx.fillRect(0, y - 3, W, 1);
    pages.push(c);
    return ctx;
  };

  const wrap = (ctx: CanvasRenderingContext2D, text: string, width: number, font: string): string[] => {
    ctx.font = font;
    const out: string[] = [];
    for (const para of text.split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (ctx.measureText(candidate).width > width && line) {
          out.push(line);
          line = word;
        } else line = candidate;
      }
      out.push(line);
    }
    return out;
  };

  let ctx = newPage();
  let section = -2;
  for (const step of flow.steps) {
    if (flow.sections.length && step.section !== section) {
      section = step.section;
      if (y + 40 > H) ctx = newPage();
      ctx.font = `750 13px ${SANS}`;
      ctx.fillStyle = INK;
      ctx.fillText(flow.sections[section]?.name ?? '', 4, y + 6);
      y += 24;
    }
    const cells = cellsOf(step, notes);
    const laid = cols.map((col) =>
      cells[col.key].map((p) => ({ ...p, lines: wrap(ctx, p.text, col.w * W - 10, p.font) })),
    );
    const rowH = Math.max(...laid.map((ps) => ps.reduce((a, p) => a + p.lines.length * 15 + 2, 0))) + 10;
    if (y + rowH > H) ctx = newPage();
    let cx = 0;
    laid.forEach((ps, i) => {
      let cy = y + 5;
      for (const p of ps) {
        ctx.font = p.font;
        ctx.fillStyle = p.color ?? INK;
        for (const line of p.lines) {
          ctx.fillText(line, cx + 4, cy);
          cy += 15;
        }
        cy += 2;
      }
      cx += (cols[i]?.w ?? 0) * W;
    });
    y += rowH;
    ctx.fillStyle = '#e6e9ee';
    ctx.fillRect(0, y - 2, W, 1);
  }
  return pages;
}
