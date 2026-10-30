import type { Flow } from '@swv/core';

import { lineStart, localCenter, svgEl, type Box, type Geo, type StepDom, type ViewBox } from './geometry.ts';

export interface DrawContext {
  svg: SVGSVGElement;
  dom: StepDom[];
  flow: Flow;
  vb: ViewBox;
  geo: Geo;
  dark: boolean;
}

const remove = (root: ParentNode, selector: string) => {
  root.querySelectorAll(selector).forEach((n) => {
    n.remove();
  });
};

const labelBounds = (texts: SVGGraphicsElement[]): Box => {
  const bs = texts.map((t) => t.getBBox());
  const x0 = Math.min(...bs.map((b) => b.x));
  const y0 = Math.min(...bs.map((b) => b.y));
  const x1 = Math.max(...bs.map((b) => b.x + b.width));
  const y1 = Math.max(...bs.map((b) => b.y + b.height));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};

/**
 * Marks the current step: a thick marker stroke under the arrow, a pill behind its label, a ring
 * around its number, dashed rings on the steps it is paired with, and the `swv-cur` class on its
 * parts. With `dim`, every other arrow fades.
 */
export function applyHighlight(ctx: DrawContext, index: number, dim: boolean): void {
  const { svg, dom, flow, dark } = ctx;
  remove(svg, '.swv-marker, .swv-pill, .swv-ring, .swv-pair');
  svg.querySelectorAll('.swv-cur').forEach((n) => {
    n.classList.remove('swv-cur');
  });
  svg.classList.toggle('swv-dim', dim && index >= 0);
  const d = dom[index];
  const step = flow.steps[index];
  if (!d || !step) return;

  const paired = step.kind === 'reply' && step.answers >= 0 ? [step.answers] : step.replies;
  for (const j of paired) {
    const pd = dom[j];
    if (!pd) continue;
    const pc = pd.num ? localCenter(pd.num) : lineStart(pd.line);
    const ring = svgEl('circle', {
      class: 'swv-pair',
      cx: pc.x,
      cy: pc.y,
      r: 16,
      style: 'fill: none; stroke: #f0b400; stroke-width: 2px; stroke-dasharray: 4 3; pointer-events: none',
    });
    (pd.num ?? pd.line).after(ring);
  }

  const marker = d.line.cloneNode(false) as SVGElement;
  for (const a of ['class', 'marker-end', 'marker-start', 'id', 'data-step']) marker.removeAttribute(a);
  marker.setAttribute(
    'style',
    `stroke: #ffd43b; stroke-opacity: ${dark ? 0.55 : 0.75}; stroke-width: 10px; stroke-linecap: round; stroke-dasharray: none; fill: none; pointer-events: none`,
  );
  marker.setAttribute('class', 'swv-marker');
  d.line.before(marker);

  if (d.texts.length) {
    const b = labelBounds(d.texts);
    const first = d.texts[0];
    if (first) {
      first.before(
        svgEl('rect', {
          class: 'swv-pill',
          x: b.x - 6,
          y: b.y - 2,
          width: b.w + 12,
          height: b.h + 4,
          rx: 5,
          style: `fill: ${dark ? '#7a5c00' : '#ffe680'}; fill-opacity: ${dark ? 0.85 : 0.9}; pointer-events: none`,
        }),
      );
    }
  }

  const c = d.num ? localCenter(d.num) : lineStart(d.line);
  (d.num ?? d.line).after(
    svgEl('circle', {
      class: 'swv-ring',
      cx: c.x,
      cy: c.y,
      r: 13,
      style: 'fill: none; stroke: #f0b400; stroke-width: 3px; pointer-events: none',
    }),
  );
  for (const e of [d.line, ...d.texts, d.num]) e?.classList.add('swv-cur');
}

/**
 * A light band in the chapter's colour behind the arrows of the current chapter, with start and end
 * markers. Arrows of the other chapters fade a little.
 */
export function drawChapterBand(ctx: DrawContext, index: number, bandsOn: boolean): void {
  const { svg, dom, flow, vb, dark } = ctx;
  remove(svg, '.swv-band, .swv-band-label');
  const step = flow.steps[index];
  const section = step && flow.sections.length && bandsOn ? flow.sections[step.section] : undefined;
  svg.classList.toggle('swv-chap', Boolean(section));
  dom.forEach((d, k) => {
    const out = Boolean(section) && flow.steps[k]?.section !== section?.idx;
    for (const e of [d.line, ...d.texts, d.num]) e?.classList.toggle('swv-outch', out);
  });
  if (!section) return;
  const boxes = dom.slice(section.firstStep, section.firstStep + section.count).map((d) => d.box);
  if (boxes.length === 0) return;
  const y0 = Math.min(...boxes.map((b) => b.y)) - 6;
  const y1 = Math.max(...boxes.map((b) => b.y + b.h)) + 6;
  const fill = dark ? `hsl(${section.hue} 45% 28%)` : `hsl(${section.hue} 85% 90%)`;
  const ink = dark ? `hsl(${section.hue} 70% 80%)` : `hsl(${section.hue} 60% 32%)`;
  const band = svgEl('rect', {
    class: 'swv-band',
    x: vb.x,
    y: vb.y + y0,
    width: vb.w,
    height: y1 - y0,
    rx: 6,
    style: `fill: ${fill}; fill-opacity: ${dark ? 0.55 : 0.6}; pointer-events: none`,
  });
  const edge = svgEl('rect', {
    class: 'swv-band',
    x: vb.x + 2,
    y: vb.y + y0,
    width: 4,
    height: y1 - y0,
    rx: 2,
    style: `fill: ${ink}; fill-opacity: .8; pointer-events: none`,
  });
  const label = (text: string, y: number, baseline: string) => {
    const t = svgEl('text', {
      class: 'swv-band-label',
      x: vb.x + 12,
      y,
      style: `font: 600 11px Recursive, sans-serif; fill: ${ink}; pointer-events: none; dominant-baseline: ${baseline}`,
    });
    t.textContent = text;
    return t;
  };
  const first = svg.querySelector(':scope > :not(style):not(defs)');
  (first ?? svg).before(band);
  band.after(edge);
  const count = section.count === 1 ? '1 step' : `${section.count} steps`;
  svg.appendChild(label(`▶ ${section.name} · ${count}`, vb.y + y0 + 4, 'hanging'));
  if (y1 - y0 > 40) svg.appendChild(label(`■ end of ${section.name}`, vb.y + y1 - 5, 'auto'));
}

export interface DecorateOptions {
  followHits: ReadonlySet<number>;
  /** Bookmark and note marks per step index: 'star', 'note' or nothing. */
  marks: (index: number) => 'star' | 'note' | null;
  spot: string | null;
  visible: (index: number) => boolean;
}

/** Blue rings (Follow), stars and pencils (bookmarks and notes), spotlight and path fading. */
export function decorate(ctx: DrawContext, options: DecorateOptions): void {
  const { svg, dom, flow, dark } = ctx;
  remove(svg, '.swv-follow, .swv-star');
  drawBoundaries(ctx);
  dom.forEach((d, i) => {
    const c = d.num ? localCenter(d.num) : lineStart(d.line);
    if (options.followHits.has(i)) {
      d.line.after(
        svgEl('circle', {
          class: 'swv-follow',
          cx: c.x,
          cy: c.y,
          r: 17,
          style: 'fill: none; stroke: #1d5bd0; stroke-width: 3px; pointer-events: none',
        }),
      );
    }
    const mark = options.marks(i);
    if (mark) {
      const t = svgEl('text', {
        class: 'swv-star',
        x: c.x - 22,
        y: c.y - 9,
        style: `font: 700 15px sans-serif; fill: ${mark === 'star' ? '#e0a800' : '#8a93a3'}; stroke: ${dark ? '#000' : '#fff'}; stroke-width: 3px; paint-order: stroke; pointer-events: none`,
      });
      t.textContent = mark === 'star' ? '★' : '✎';
      (d.num ?? d.line).after(t);
    }
  });
  svg.classList.toggle('swv-spot', options.spot !== null);
  const anyHidden = flow.steps.some((s) => !options.visible(s.idx));
  svg.classList.toggle('swv-path', anyHidden);
  dom.forEach((d, i) => {
    const s = flow.steps[i];
    if (!s) return;
    const out = options.spot !== null && s.from !== options.spot && s.to !== options.spot;
    const off = !options.visible(i);
    for (const e of [d.line, ...d.texts, d.num, d.hitLine, d.hitLabel]) {
      if (!e) continue;
      e.classList.toggle('swv-out', out);
      e.classList.toggle('swv-off', off);
    }
  });
}

/** Dotted vertical lines where neighbouring layers sit in different trust zones. */
export function drawBoundaries(ctx: DrawContext): void {
  const { svg, flow, geo, vb, dark } = ctx;
  remove(svg, '.swv-boundary');
  if (flow.boundaries.length === 0) return;
  const colour = dark ? '#9aa4b8' : '#6b7486';
  for (const b of flow.boundaries) {
    const left = geo.actors[b.left]?.top;
    const right = geo.actors[b.right]?.top;
    if (!left || !right) continue;
    const x = vb.x + (left.x + left.w + right.x) / 2;
    const y0 = vb.y + geo.rowBottom + 4;
    const y1 = vb.y + geo.bottomTop - 4;
    svg.appendChild(
      svgEl('line', {
        class: 'swv-boundary',
        x1: x,
        y1: y0,
        x2: x,
        y2: y1,
        style: `stroke: ${colour}; stroke-width: 1.5px; stroke-dasharray: 3 6; opacity: .7; pointer-events: none`,
      }),
    );
    const t = svgEl('text', {
      class: 'swv-boundary',
      x: x + 4,
      y: y0 + 12,
      style: `font: 600 10px Recursive, sans-serif; fill: ${colour}; pointer-events: none`,
    });
    t.textContent = `${b.from} │ ${b.to}`;
    svg.appendChild(t);
  }
}
