import { useCallback, useRef, type RefObject, type WheelEvent } from 'react';

import { useFlowStore } from '../../shared/state/flowStore.ts';
import { toast } from '../../shared/ui/toast.ts';

const THRESHOLD = 40;
const MIN_GAP_MS = 160;
const IDLE_MS = 250;

/**
 * Wheel over the step bar steps through the flow: the dominant delta accumulates until 40, at most
 * one step per 160 ms, and the sum is forgotten after 250 ms of rest. The centre card scrolls first
 * while it can; inputs, selects and a horizontal wheel over the chapter row are left alone.
 */
export function useWheelStep(centreRef: RefObject<HTMLElement | null>) {
  const acc = useRef(0);
  const lastFire = useRef(0);
  const idle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  return useCallback(
    (ev: WheelEvent<HTMLElement>) => {
      const target = ev.target instanceof Element ? ev.target : null;
      if (target?.closest('textarea, input, select')) return;
      const horizontal = Math.abs(ev.deltaX) > Math.abs(ev.deltaY);
      if (horizontal && target?.closest('[data-chapters]')) return;
      const delta = horizontal ? ev.deltaX : ev.deltaY;
      const centre = centreRef.current;
      if (!horizontal && centre && target && centre.contains(target)) {
        const canScroll =
          delta > 0 ? centre.scrollTop + centre.clientHeight < centre.scrollHeight - 1 : centre.scrollTop > 0;
        if (canScroll) return;
      }
      clearTimeout(idle.current);
      idle.current = setTimeout(() => {
        acc.current = 0;
      }, IDLE_MS);
      acc.current += delta;
      const now = performance.now();
      if (Math.abs(acc.current) < THRESHOLD || now - lastFire.current < MIN_GAP_MS) return;
      const direction = acc.current > 0 ? 1 : -1;
      acc.current = 0;
      lastFire.current = now;
      const s = useFlowStore.getState();
      const message = direction > 0 ? s.next() : s.prev();
      if (message) toast(message);
    },
    [centreRef],
  );
}
