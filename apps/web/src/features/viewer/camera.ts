import { clamp } from '../../shared/lib/util.ts';
import type { Box } from './geometry.ts';

export interface CameraState {
  x: number;
  y: number;
  k: number;
}

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 8;

/**
 * Pan and zoom of the diagram layer. Pure arithmetic over the canvas size and the diagram size;
 * the component applies the resulting transform.
 */
export class Camera {
  x = 0;
  y = 0;
  k = 1;
  /** Diagram size in viewBox units. */
  W = 0;
  H = 0;
  private anim = 0;
  private size: () => { w: number; h: number } = () => ({ w: 0, h: 0 });
  private onChange: (state: CameraState) => void = () => undefined;
  private reducedMotion: () => boolean = () => false;

  /** Connects the camera to its canvas; called from an effect, once the elements exist. */
  bind(
    size: () => { w: number; h: number },
    onChange: (state: CameraState) => void,
    reducedMotion: () => boolean,
  ): void {
    this.size = size;
    this.onChange = onChange;
    this.reducedMotion = reducedMotion;
  }

  setContent(w: number, h: number): void {
    this.W = w;
    this.H = h;
  }

  private apply(): void {
    this.onChange({ x: this.x, y: this.y, k: this.k });
  }

  private clampPos(): void {
    const { w, h } = this.size();
    const m = 60;
    const dw = this.W * this.k;
    const dh = this.H * this.k;
    this.x = clamp(this.x, Math.min(m - dw, w - m), Math.max(w - m, m - dw));
    this.y = clamp(this.y, Math.min(m - dh, h - m), Math.max(h - m, m - dh));
  }

  set(x: number, y: number, k?: number): void {
    cancelAnimationFrame(this.anim);
    this.k = clamp(k ?? this.k, ZOOM_MIN, ZOOM_MAX);
    this.x = x;
    this.y = y;
    this.clampPos();
    this.apply();
  }

  /** Re-clamps after the canvas changed size. */
  refresh(): void {
    this.clampPos();
    this.apply();
  }

  zoomAt(px: number, py: number, factor: number): void {
    const k2 = clamp(this.k * factor, ZOOM_MIN, ZOOM_MAX);
    const r = k2 / this.k;
    this.set(px - (px - this.x) * r, py - (py - this.y) * r, k2);
  }

  zoomCenter(factor: number): void {
    const { w, h } = this.size();
    this.zoomAt(w / 2, h / 2, factor);
  }

  zoomTo(k: number): void {
    const { w, h } = this.size();
    this.zoomAt(w / 2, h / 2, k / this.k);
  }

  panBy(dx: number, dy: number): void {
    this.set(this.x + dx, this.y + dy);
  }

  fitWidth(insetLeft: number): void {
    if (!this.W) return;
    const { w } = this.size();
    const k = clamp((w - insetLeft - 48) / this.W, ZOOM_MIN, ZOOM_MAX);
    this.set(insetLeft + (w - insetLeft - this.W * k) / 2, 24, k);
  }

  fitAll(insetLeft: number): void {
    if (!this.W) return;
    const { w, h } = this.size();
    const k = clamp(Math.min((w - insetLeft - 48) / this.W, (h - 48) / this.H), ZOOM_MIN, ZOOM_MAX);
    this.set(insetLeft + (w - insetLeft - this.W * k) / 2, (h - this.H * k) / 2, k);
  }

  /** First view of a diagram: fit the width but never zoom in past 100%. */
  initial(): void {
    if (!this.W) return;
    const { w } = this.size();
    const k = clamp(Math.min(1, (w - 48) / this.W), ZOOM_MIN, 1);
    this.set((w - this.W * k) / 2, 24, k);
  }

  glideTo(x: number, y: number, ms = 320): void {
    cancelAnimationFrame(this.anim);
    if (this.reducedMotion() || ms <= 0) {
      this.set(x, y);
      return;
    }
    const x0 = this.x;
    const y0 = this.y;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      this.x = x0 + (x - x0) * e;
      this.y = y0 + (y - y0) * e;
      this.clampPos();
      this.apply();
      if (p < 1) this.anim = requestAnimationFrame(step);
    };
    this.anim = requestAnimationFrame(step);
  }

  /** Visible area for the follow camera: canvas minus pinned header, open code panel and margins. */
  private visibleArea(headerHeight: number, insetLeft: number) {
    const { w, h } = this.size();
    const top = headerHeight * this.k + 12;
    const left = insetLeft + 12;
    return { x0: left, y0: top, x1: w - 12, y1: h - 56, w: w - 12 - left, h: h - 56 - top };
  }

  /** Brings a step's arrow into view, at 40% of the height when it fits, centred otherwise. */
  followStep(box: Box, labelBox: Box | null, headerHeight: number, insetLeft: number, ms = 320): void {
    const v = this.visibleArea(headerHeight, insetLeft);
    const k = this.k;
    const sx = this.x + box.x * k;
    const sy = this.y + box.y * k;
    const sw = box.w * k;
    const sh = box.h * k;
    if (sx >= v.x0 && sy >= v.y0 && sx + sw <= v.x1 && sy + sh <= v.y1) return;
    let nx = this.x;
    let ny: number;
    if (sw <= v.w && sh <= v.h) {
      ny = v.y0 + 0.4 * v.h - (box.y + box.h / 2) * k;
      ny = clamp(ny, v.y1 - (box.y + box.h) * k, v.y0 - box.y * k);
      if (sx < v.x0 || sx + sw > v.x1) nx = v.x0 + v.w / 2 - (box.x + box.w / 2) * k;
    } else {
      const lb = labelBox ?? box;
      nx = v.x0 + v.w / 2 - (lb.x + lb.w / 2) * k;
      ny = v.y0 + v.h / 2 - (lb.y + lb.h / 2) * k;
    }
    this.glideTo(nx, ny, ms);
  }
}
