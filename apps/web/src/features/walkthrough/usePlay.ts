import { useEffect, useRef } from 'react';

import { useFlowStore, visibleSteps } from '../../shared/state/flowStore.ts';
import { toast } from '../../shared/ui/toast.ts';

/** One tick of autoplay: the next visible step, or stop at the end or at a locked chapter. */
function tick(): void {
  const s = useFlowStore.getState();
  const n = s.flow?.isSequence ? s.flow.steps.length : 0;
  if (!n || !visibleSteps(s.flow, s.path).some((i) => i > s.cur)) {
    s.setPlaying(false);
    return;
  }
  const message = s.next();
  if (message) {
    toast(message);
    s.setPlaying(false);
  }
}

/**
 * Autoplay: while `playing`, advance every `settings.speed` ms. Starting at the end goes back to
 * step 1. A new speed restarts the timer; the Ask panel pauses it.
 */
export function usePlay(): void {
  const playing = useFlowStore((s) => s.playing);
  const speed = useFlowStore((s) => s.settings.speed);
  const askOpen = useFlowStore((s) => s.ui.askOpen);
  const started = useRef(false);

  useEffect(() => {
    if (!playing) {
      started.current = false;
      return;
    }
    if (askOpen) return;
    if (!started.current) {
      started.current = true;
      const s = useFlowStore.getState();
      const n = s.flow?.isSequence ? s.flow.steps.length : 0;
      if (n && s.cur >= n - 1) s.go(0);
      else tick();
    }
    const timer = setInterval(tick, Math.max(200, speed));
    return () => {
      clearInterval(timer);
    };
  }, [playing, speed, askOpen]);
}
