import { clamp } from '../../shared/lib/util.ts';
import { context2d, makeCanvas, type Raster } from '../../shared/lib/raster.ts';

/**
 * The step image is what the canvas shows right now: the live diagram with the current step's
 * highlights, cropped to the visible part, with the pinned participant header painted where it
 * sits on screen.
 */

export interface VisibleCrop {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Screen pixels per diagram unit. */
  k: number;
}

/** The part of the diagram inside the canvas, in diagram units, or null when it cannot be read. */
export function visibleCrop(svg: SVGSVGElement, width: number, height: number): VisibleCrop | null {
  const canvas = svg.closest('[role="application"]');
  if (!canvas || width <= 0 || height <= 0) return null;
  const s = svg.getBoundingClientRect();
  const c = canvas.getBoundingClientRect();
  const k = s.width / width;
  if (!(k > 0)) return null;
  const x0 = clamp((c.left - s.left) / k, 0, width);
  const x1 = clamp((c.right - s.left) / k, 0, width);
  const y0 = clamp((c.top - s.top) / k, 0, height);
  const y1 = clamp((c.bottom - s.top) / k, 0, height);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x0, y0, x1, y1, k };
}

export interface PinnedHeader {
  /** Screen offset of the header inside the canvas. */
  top: number;
  /** Band in diagram units. */
  hdrTop: number;
  hdrH: number;
}

/** The pinned header's place when it is shown over the diagram. */
export function pinnedHeader(svg: SVGSVGElement): PinnedHeader | null {
  const header = document.getElementById(`${svg.id}-hdr`);
  const canvas = svg.closest('[role="application"]');
  if (!(header instanceof SVGSVGElement) || !canvas || header.closest('[hidden]')) return null;
  const vb = header.viewBox.baseVal;
  if (!(vb.height > 0)) return null;
  const top = header.getBoundingClientRect().top - canvas.getBoundingClientRect().top;
  return { top, hdrTop: vb.y - svg.viewBox.baseVal.y, hdrH: vb.height };
}

/** Cuts the crop out of the full raster and paints the pinned header over its top. */
export function cropRaster(
  raster: Raster,
  crop: VisibleCrop,
  header: PinnedHeader | null,
  background: string,
): HTMLCanvasElement {
  const { canvas, scale } = raster;
  const out = makeCanvas((crop.x1 - crop.x0) * scale, (crop.y1 - crop.y0) * scale);
  const ctx = context2d(out);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, crop.x0 * scale, crop.y0 * scale, out.width, out.height, 0, 0, out.width, out.height);
  if (header) {
    const top = (header.top / crop.k) * scale;
    const hh = header.hdrH * scale;
    ctx.fillStyle = background;
    ctx.fillRect(0, top, out.width, hh);
    ctx.drawImage(canvas, crop.x0 * scale, header.hdrTop * scale, out.width, hh, 0, top, out.width, hh);
  }
  return out;
}
