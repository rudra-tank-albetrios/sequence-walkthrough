import { useCallback, useRef, type RefObject, type WheelEvent } from 'react';

import { useFlowStore } from '../../shared/state/flowStore.ts';
import { toast } from '../../shared/ui/toast.ts';
import { createWheelGate } from './wheelGate.ts';

/**
 * Wheel over the step bar steps through the flow, one step per scroll however big it is (`wheelGate`).
 * The centre card scrolls first while it can; inputs, selects and a horizontal wheel over the chapter
 * row are left alone. `onStep` hears each step, for the cue that shows the scroll was taken.
 */
export function useWheelStep(centreRef: RefObject<HTMLElement | null>, onStep: (direction: 1 | -1) => void) {
  const gate = useRef(createWheelGate());

  return useCallback(
    (ev: WheelEvent<HTMLElement>) => {
      const target = ev.target instanceof Element ? ev.target : null;
      // A dialog or popover opened from the bar sends its wheel here too, but it scrolls itself.
      if (!target || !ev.currentTarget.contains(target)) return;
      if (target.closest('textarea, input, select')) return;
      const horizontal = Math.abs(ev.deltaX) > Math.abs(ev.deltaY);
      if (horizontal && target.closest('[data-chapters]')) return;
      const delta = horizontal ? ev.deltaX : ev.deltaY;
      const centre = centreRef.current;
      if (!horizontal && centre?.contains(target)) {
        const canScroll =
          delta > 0 ? centre.scrollTop + centre.clientHeight < centre.scrollHeight - 1 : centre.scrollTop > 0;
        if (canScroll) return;
      }
      const direction = gate.current(delta, performance.now());
      if (direction === 0) return;
      const s = useFlowStore.getState();
      const message = direction > 0 ? s.next() : s.prev();
      if (message) toast(message);
      else onStep(direction);
    },
    [centreRef, onStep],
  );
}
