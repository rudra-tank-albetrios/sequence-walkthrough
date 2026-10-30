import type { Participant } from '@swv/core';

import { actorElement, actorGroup, svgEl, type Geo, type ViewBox } from './geometry.ts';

/**
 * A copy of the participant row that stays pinned at the top of the canvas while the diagram
 * scrolls under it. It is a second SVG showing only the row's slice of the viewBox.
 */
export function buildHeader(
  svg: SVGSVGElement,
  id: string,
  vb: ViewBox,
  geo: Geo,
  participants: Participant[],
): SVGSVGElement | null {
  if (!(geo.rowBottom > geo.rowTop)) return null;
  const hs = svg.cloneNode(false) as SVGSVGElement;
  hs.setAttribute('id', `${id}-hdr`);
  hs.setAttribute('viewBox', `${vb.x} ${vb.y + geo.hdrTop} ${vb.w} ${geo.hdrH}`);
  hs.setAttribute('width', String(vb.w));
  hs.setAttribute('height', String(geo.hdrH));
  hs.setAttribute('aria-hidden', 'true');
  hs.removeAttribute('aria-labelledby');
  hs.removeAttribute('aria-describedby');
  const idRe = new RegExp(`#${id}(?![\\w-])`, 'g');
  for (const st of svg.querySelectorAll('style')) {
    const c = st.cloneNode(true) as SVGStyleElement;
    c.textContent = c.textContent.replace(idRe, `#${id}-hdr`);
    hs.appendChild(c);
  }
  hs.appendChild(svgEl('g', { class: 'swv-halos' }));
  const inv = svg.getScreenCTM()?.inverse();
  for (const p of participants) {
    const t = actorElement(svg, p.alias, 'top');
    if (!t) continue;
    const grp = actorGroup(t);
    const parentCtm = (grp.parentNode as SVGGraphicsElement | null)?.getScreenCTM();
    const m = inv && parentCtm ? inv.multiply(parentCtm) : null;
    const wrap = svgEl('g', {
      transform: m ? `matrix(${m.a},${m.b},${m.c},${m.d},${m.e},${m.f})` : '',
    });
    const c = grp.cloneNode(true) as Element;
    c.setAttribute('data-alias', p.alias);
    c.classList.add('swv-actor');
    wrap.appendChild(c);
    hs.appendChild(wrap);
  }
  return hs;
}

export interface HeaderPlacement {
  /** Pixel offset of the header SVG inside the canvas, or null when it should be hidden. */
  top: number;
  height: number;
}

/** Where the pinned header sits for the current camera, or null while the real row is on screen. */
export function headerPlacement(geo: Geo, camera: { x: number; y: number; k: number }): HeaderPlacement | null {
  const k = camera.k;
  const rowScreen = camera.y + geo.hdrTop * k;
  const hH = geo.hdrH * k;
  if (rowScreen >= 0) return null;
  const endScreen = camera.y + geo.bottomTop * k;
  const top = Math.min(0, endScreen - hH - 4 * k);
  if (top + hH <= 0) return null;
  return { top, height: hH };
}

/** Yellow halo on the sender and receiver, in the pinned header and in the diagram's own rows. */
export function setActiveActors(
  main: SVGSVGElement,
  header: SVGSVGElement | null,
  geo: Geo,
  vb: ViewBox,
  aliases: string[],
  dark: boolean,
): void {
  const list = [...new Set(aliases)];
  const halo = (x: number, y: number, w: number, h: number) =>
    svgEl('rect', {
      class: 'swv-halo',
      x: x - 5,
      y: y - 5,
      width: w + 10,
      height: h + 10,
      rx: 9,
      style: `fill: ${dark ? '#ffd43b55' : '#ffd43b'}; fill-opacity: ${dark ? 1 : 0.55}; stroke: #f0b400; stroke-width: 2px; pointer-events: none`,
    });
  if (header) {
    header.querySelectorAll('.swv-halo').forEach((n) => {
      n.remove();
    });
    const layer = header.querySelector('.swv-halos');
    for (const a of list) {
      const b = geo.actors[a]?.top;
      if (b && layer) layer.appendChild(halo(b.x + vb.x, b.y + vb.y, b.w, b.h));
    }
  }
  main.querySelectorAll('.swv-halo').forEach((n) => {
    n.remove();
  });
  for (const a of list) {
    for (const pos of ['top', 'bottom'] as const) {
      const t = actorElement(main, a, pos);
      if (!t) continue;
      const grp = actorGroup(t) as SVGGraphicsElement;
      const b = grp.getBBox();
      grp.before(halo(b.x, b.y, b.width, b.height));
    }
  }
}
