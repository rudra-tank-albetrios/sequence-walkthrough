import { useEffect, useState } from 'react';

import type { Box } from './placement.ts';

/** How long a stop waits for its element before showing the card without a spotlight. */
const WAIT_MS = 800;

/** The first element with this `data-tour` value that takes up room on screen. */
function findTarget(name: string): Element | null {
  for (const element of document.querySelectorAll(`[data-tour="${name}"]`)) {
    const { width, height } = element.getBoundingClientRect();
    if (width > 0 && height > 0) return element;
  }
  return null;
}

function sameBox(a: Box | null, b: Box | null): boolean {
  if (a === null || b === null) return a === b;
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
}

export interface TargetState {
  box: Box | null;
  /** The element was found, or the wait is over: the card can show. */
  settled: boolean;
}

/**
 * Follows one `data-tour` element every frame, so the spotlight stays on it through a resize, a late
 * chunk or a panel sliding in. Mount it per stop: the state starts fresh.
 */
export function useTarget(name: string): TargetState {
  const [state, setState] = useState<TargetState>({ box: null, settled: false });
  useEffect(() => {
    const startedAt = performance.now();
    let scrolled = false;
    let shown: TargetState = { box: null, settled: false };
    let frame = requestAnimationFrame(function tick() {
      const element = findTarget(name);
      if (element && !scrolled) {
        element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        scrolled = true;
      }
      const rect = element?.getBoundingClientRect();
      const box = rect
        ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
        : null;
      const settled = shown.settled || box !== null || performance.now() - startedAt > WAIT_MS;
      if (!sameBox(shown.box, box) || shown.settled !== settled) {
        shown = { box, settled };
        setState(shown);
      }
      frame = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [name]);
  return state;
}
