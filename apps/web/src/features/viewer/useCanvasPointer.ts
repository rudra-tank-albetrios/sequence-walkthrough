import { useEffect, type RefObject } from 'react';

import { clamp } from '../../shared/lib/util.ts';
import type { Camera } from './camera.ts';
import { ZOOM_MAX, ZOOM_MIN } from './camera.ts';

export interface PointerHandlers {
  /** A click without movement on something inside the canvas. */
  onClick(target: Element): void;
  onHover(target: Element | null, clientX: number, clientY: number): void;
  onDoubleClick(clientX: number, clientY: number): void;
  wheelMode: () => 'scroll' | 'zoom';
}

const IGNORE = '[data-canvas-ui]';

/** Drag to pan, pinch to zoom, wheel to scroll or zoom, click and hover on arrows and participants. */
export function useCanvasPointer(
  canvasRef: RefObject<HTMLDivElement | null>,
  camera: Camera,
  handlers: PointerHandlers,
): void {
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const pts = new Map<number, { x: number; y: number }>();
    let drag: { start: { x: number; y: number }; cam: { x: number; y: number }; moved: boolean; target: Element } | null = null;
    let pinch: { d: number; k: number; mid: { x: number; y: number }; cam: { x: number; y: number } } | null = null;
    const local = (ev: { clientX: number; clientY: number }) => {
      const r = c.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    };

    const down = (ev: PointerEvent) => {
      const target = ev.target as Element;
      if (target.closest(IGNORE)) return;
      if (ev.button !== 0 && ev.pointerType === 'mouse') return;
      handlers.onHover(null, 0, 0);
      try {
        c.setPointerCapture(ev.pointerId);
      } catch {
        /* pointer already gone */
      }
      pts.set(ev.pointerId, local(ev));
      if (pts.size === 1) drag = { start: local(ev), cam: { x: camera.x, y: camera.y }, moved: false, target };
      else if (pts.size === 2) {
        const [a, b] = [...pts.values()] as [{ x: number; y: number }, { x: number; y: number }];
        pinch = {
          d: Math.hypot(a.x - b.x, a.y - b.y),
          k: camera.k,
          mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          cam: { x: camera.x, y: camera.y },
        };
        drag = null;
      }
    };
    const move = (ev: PointerEvent) => {
      if (!pts.has(ev.pointerId)) {
        if (ev.pointerType !== 'mouse') return;
        handlers.onHover(ev.target as Element, ev.clientX, ev.clientY);
        return;
      }
      pts.set(ev.pointerId, local(ev));
      if (pinch && pts.size >= 2) {
        const [a, b] = [...pts.values()] as [{ x: number; y: number }, { x: number; y: number }];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const k2 = clamp((pinch.k * d) / pinch.d, ZOOM_MIN, ZOOM_MAX);
        const r = k2 / pinch.k;
        camera.set(mid.x - (pinch.mid.x - pinch.cam.x) * r, mid.y - (pinch.mid.y - pinch.cam.y) * r, k2);
        return;
      }
      if (!drag) return;
      const p = local(ev);
      const dx = p.x - drag.start.x;
      const dy = p.y - drag.start.y;
      if (!drag.moved && Math.hypot(dx, dy) < 5) return;
      drag.moved = true;
      c.classList.add('dragging');
      camera.set(drag.cam.x + dx, drag.cam.y + dy);
    };
    const end = (ev: PointerEvent) => {
      if (!pts.has(ev.pointerId)) return;
      pts.delete(ev.pointerId);
      if (pts.size < 2) pinch = null;
      if (drag && !drag.moved && ev.type === 'pointerup') handlers.onClick(drag.target);
      if (pts.size === 0) {
        drag = null;
        c.classList.remove('dragging');
      }
    };
    const leave = () => {
      handlers.onHover(null, 0, 0);
    };
    const wheel = (ev: WheelEvent) => {
      if ((ev.target as Element).closest(IGNORE)) return;
      ev.preventDefault();
      const unit = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? c.clientHeight : 1;
      const dx = ev.deltaX * unit;
      const dy = ev.deltaY * unit;
      const p = local(ev);
      if (ev.ctrlKey || ev.metaKey) camera.zoomAt(p.x, p.y, Math.exp(-dy * 0.01));
      else if (handlers.wheelMode() === 'zoom') camera.zoomAt(p.x, p.y, Math.exp(-dy * 0.0025));
      else if (ev.shiftKey && !dx) camera.panBy(-dy, 0);
      else camera.panBy(-dx, -dy);
    };
    const dbl = (ev: MouseEvent) => {
      handlers.onDoubleClick(ev.clientX, ev.clientY);
    };

    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', leave);
    c.addEventListener('wheel', wheel, { passive: false });
    c.addEventListener('dblclick', dbl);
    return () => {
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', end);
      c.removeEventListener('pointercancel', end);
      c.removeEventListener('pointerleave', leave);
      c.removeEventListener('wheel', wheel);
      c.removeEventListener('dblclick', dbl);
    };
  }, [canvasRef, camera, handlers]);
}
