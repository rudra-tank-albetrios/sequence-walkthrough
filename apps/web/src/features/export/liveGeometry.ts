import { union, type Box } from '../../shared/lib/box.ts';

/**
 * What the PDF and the step image need to know about the drawn diagram, read from the live SVG:
 * the participant row (repeated on every PDF page) and each arrow's box (pages are cut between
 * arrows). Measured in diagram units with the viewBox origin removed.
 */

export interface LiveGeometry {
  /** Top of the participant row band and its height, as the pinned header shows it. */
  hdrTop: number;
  hdrH: number;
  /** One box per step, in step order, 8 units around line, label and number. */
  boxes: Box[];
}

export function measureLive(svg: SVGSVGElement): LiveGeometry | null {
  const inverse = svg.getScreenCTM()?.inverse();
  if (!inverse) return null;
  const origin = { x: svg.viewBox.baseVal.x, y: svg.viewBox.baseVal.y };

  const box = (el: Element): Box | null => {
    if (!(el instanceof SVGGraphicsElement)) return null;
    const ctm = el.getScreenCTM();
    if (!ctm) return null;
    let b: DOMRect;
    try {
      b = el.getBBox();
    } catch {
      return null;
    }
    const m = inverse.multiply(ctm);
    const xs: number[] = [];
    const ys: number[] = [];
    const corners: [number, number][] = [
      [b.x, b.y],
      [b.x + b.width, b.y],
      [b.x, b.y + b.height],
      [b.x + b.width, b.y + b.height],
    ];
    for (const [px, py] of corners) {
      xs.push(m.a * px + m.c * py + m.e - origin.x);
      ys.push(m.b * px + m.d * py + m.f - origin.y);
    }
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  };

  const parts = new Map<number, Box[]>();
  for (const el of svg.querySelectorAll('[data-step]:not(.swv-hit)')) {
    const index = Number(el.getAttribute('data-step'));
    const b = box(el);
    if (!Number.isInteger(index) || !b) continue;
    const list = parts.get(index) ?? [];
    list.push(b);
    parts.set(index, list);
  }
  const boxes = [...parts.entries()]
    .sort((a, b) => a[0] - b[0])
    .flatMap(([, list]) => {
      const u = union(list);
      return u ? [{ x: u.x - 8, y: u.y - 8, w: u.w + 16, h: u.h + 16 }] : [];
    });

  const rows: Box[] = [];
  for (const el of svg.querySelectorAll('.actor-top')) {
    const group = el.closest('g') ?? el;
    const b = box(group.querySelector('text') ? group : el);
    if (b) rows.push(b);
  }
  const row = union(rows);
  return {
    hdrTop: row ? row.y - 6 : 0,
    hdrH: row ? row.h + 12 : 0,
    boxes,
  };
}
