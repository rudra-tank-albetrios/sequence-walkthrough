import type { Flow } from '@swv/core';

import { union, type Box } from '../../shared/lib/box.ts';

/** Boxes are in viewBox units with the viewBox origin removed (0,0 is the diagram's top left). */
export type ViewBox = Box;

/** The SVG elements of one drawn arrow: arrow N in the code is drawn arrow N. */
export interface StepDom {
  line: SVGGraphicsElement;
  texts: SVGGraphicsElement[];
  num: SVGGraphicsElement | null;
  lineBox: Box;
  labelBox: Box | null;
  numBox: Box | null;
  /** Union of line, label and number with an 8 unit margin. */
  box: Box;
  hitLine?: SVGElement;
  hitLabel?: SVGElement;
}

export interface Geo {
  actors: Record<string, { top?: Box; bottom?: Box }>;
  rowTop: number;
  rowBottom: number;
  bottomTop: number;
  hdrTop: number;
  hdrH: number;
}

const SVGNS = 'http://www.w3.org/2000/svg';

export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

/** Gives the SVG a viewBox and plain width and height, so the camera can scale it. */
export function normalizeSvg(svg: SVGSVGElement): ViewBox {
  const parts = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  let vb: ViewBox;
  const [x = 0, y = 0, w = 0, h = 0] = parts;
  if (parts.length === 4 && w > 0) vb = { x, y, w, h };
  else {
    const width = parseFloat(svg.getAttribute('width') ?? '') || 800;
    const height = parseFloat(svg.getAttribute('height') ?? '') || 600;
    vb = { x: 0, y: 0, w: width, h: height };
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }
  svg.removeAttribute('style');
  svg.setAttribute('width', String(vb.w));
  svg.setAttribute('height', String(vb.h));
  return vb;
}

/** The <g> that holds a participant's box and label. */
export function actorGroup(e: Element): Element {
  if (e.tagName.toLowerCase() === 'g') return e;
  let g: Element | null = e.parentElement;
  while (g?.tagName.toLowerCase() === 'g' && !g.querySelector('text') && g.parentElement) {
    g = g.parentElement;
  }
  return g ?? e;
}

export function actorElement(svg: SVGSVGElement, alias: string, pos: 'top' | 'bottom'): Element | null {
  return svg.querySelector(`.actor-${pos}[name="${CSS.escape(alias)}"]`);
}

/** Tags Mermaid's message lines, labels and numbers with the step they belong to. */
export function tagSteps(svg: SVGSVGElement, flow: Flow): { dom: Omit<StepDom, 'lineBox' | 'box' | 'labelBox' | 'numBox'>[]; mismatch: boolean } {
  const nodes = svg.querySelectorAll<SVGGraphicsElement>(
    '.messageText, .messageLine0, .messageLine1, .sequenceNumber',
  );
  const dom: { line: SVGGraphicsElement; texts: SVGGraphicsElement[]; num: SVGGraphicsElement | null }[] = [];
  let texts: SVGGraphicsElement[] = [];
  for (const n of nodes) {
    const c = n.classList;
    if (c.contains('messageText')) texts.push(n);
    else if (c.contains('messageLine0') || c.contains('messageLine1')) {
      dom.push({ line: n, texts, num: null });
      texts = [];
    } else if (c.contains('sequenceNumber')) {
      const last = dom[dom.length - 1];
      if (last && !last.num) last.num = n;
    }
  }
  const mismatch = dom.length !== flow.steps.length;
  dom.length = Math.min(dom.length, flow.steps.length);
  dom.forEach((d, i) => {
    for (const e of [d.line, ...d.texts, d.num]) e?.setAttribute('data-step', String(i));
  });
  for (const p of flow.participants) {
    for (const pos of ['top', 'bottom'] as const) {
      const e = actorElement(svg, p.alias, pos);
      if (!e) continue;
      const g = actorGroup(e);
      g.setAttribute('data-alias', p.alias);
      g.classList.add('swv-actor');
    }
  }
  return { dom, mismatch };
}

/** Measures every arrow and participant in diagram units. The SVG must be in the document. */
export function measure(
  svg: SVGSVGElement,
  tagged: ReturnType<typeof tagSteps>['dom'],
  flow: Flow,
  vb: ViewBox,
): { dom: StepDom[]; geo: Geo } {
  const inv = svg.getScreenCTM()?.inverse();
  const box = (e: SVGGraphicsElement): Box => {
    const b = e.getBBox();
    const ctm = e.getScreenCTM();
    if (!inv || !ctm) return { x: b.x - vb.x, y: b.y - vb.y, w: b.width, h: b.height };
    const m = inv.multiply(ctm);
    const corners: [number, number][] = [
      [b.x, b.y],
      [b.x + b.width, b.y],
      [b.x, b.y + b.height],
      [b.x + b.width, b.y + b.height],
    ];
    const pts = corners.map(([x, y]): [number, number] => [
      m.a * x + m.c * y + m.e,
      m.b * x + m.d * y + m.f,
    ]);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return {
      x: Math.min(...xs) - vb.x,
      y: Math.min(...ys) - vb.y,
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    };
  };
  const dom: StepDom[] = tagged.map((d) => {
    const lineBox = box(d.line);
    const labelBox = d.texts.length ? union(d.texts.map(box)) : null;
    const numBox = d.num ? box(d.num) : null;
    const u = union([lineBox, labelBox, numBox]) ?? lineBox;
    return { ...d, lineBox, labelBox, numBox, box: { x: u.x - 8, y: u.y - 8, w: u.w + 16, h: u.h + 16 } };
  });
  const actors: Geo['actors'] = {};
  let rowTop = Infinity;
  let rowBottom = -Infinity;
  let bottomTop = Infinity;
  for (const p of flow.participants) {
    const topEl = actorElement(svg, p.alias, 'top');
    const botEl = actorElement(svg, p.alias, 'bottom');
    const entry: { top?: Box; bottom?: Box } = {};
    if (topEl) {
      const b = box(actorGroup(topEl) as SVGGraphicsElement);
      entry.top = b;
      rowTop = Math.min(rowTop, b.y);
      rowBottom = Math.max(rowBottom, b.y + b.h);
    }
    if (botEl) {
      const b = box(actorGroup(botEl) as SVGGraphicsElement);
      entry.bottom = b;
      bottomTop = Math.min(bottomTop, b.y);
    }
    actors[p.alias] = entry;
  }
  if (!Number.isFinite(rowTop)) {
    rowTop = 0;
    rowBottom = 0;
  }
  return {
    dom,
    geo: {
      actors,
      rowTop,
      rowBottom,
      bottomTop: Number.isFinite(bottomTop) ? bottomTop : vb.h,
      hdrTop: rowTop - 6,
      hdrH: rowBottom - rowTop + 12,
    },
  };
}

/** The box around a step's label texts, in their parent's coordinates. */
export function labelBounds(texts: SVGGraphicsElement[]): Box {
  const bs = texts.map((t) => t.getBBox());
  const x0 = Math.min(...bs.map((b) => b.x));
  const y0 = Math.min(...bs.map((b) => b.y));
  const x1 = Math.max(...bs.map((b) => b.x + b.width));
  const y1 = Math.max(...bs.map((b) => b.y + b.height));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Wide transparent copies of each arrow and label, so hovering and clicking are easy. */
export function addHits(dom: StepDom[]): void {
  dom.forEach((d, i) => {
    const h = d.line.cloneNode(false) as SVGElement;
    for (const a of ['class', 'marker-end', 'marker-start', 'id']) h.removeAttribute(a);
    h.setAttribute('class', 'swv-hit');
    h.setAttribute('data-step', String(i));
    h.setAttribute('style', 'stroke: transparent; stroke-width: 16px; fill: none; pointer-events: stroke');
    d.line.after(h);
    d.hitLine = h;
    if (d.texts.length) {
      const b = labelBounds(d.texts);
      const r = svgEl('rect', {
        x: b.x - 4,
        y: b.y - 2,
        width: b.w + 8,
        height: b.h + 4,
        class: 'swv-hit',
        'data-step': i,
        style: 'fill: transparent; pointer-events: all',
      });
      h.after(r);
      d.hitLabel = r;
    }
  });
}

/** Local (parent) coordinates of an element's centre, for overlays drawn as siblings. */
export function localCenter(e: SVGGraphicsElement): { x: number; y: number } {
  const b = e.getBBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

export function lineStart(line: SVGGraphicsElement): { x: number; y: number } {
  if (line.tagName.toLowerCase() === 'line') {
    return { x: Number(line.getAttribute('x1')), y: Number(line.getAttribute('y1')) };
  }
  const m = /M\s*([-\d.]+)[ ,]+([-\d.]+)/i.exec(line.getAttribute('d') ?? '');
  return m?.[1] && m[2] ? { x: Number(m[1]), y: Number(m[2]) } : localCenter(line);
}
