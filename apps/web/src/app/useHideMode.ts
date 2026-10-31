import { useEffect, useRef } from 'react';

import { useFlowStore } from '../shared/state/flowStore.ts';
import { announce } from '../shared/ui/announce.ts';

function focusCanvas(): void {
  document.querySelector<HTMLElement>('[data-testid="diagram"]')?.focus({ preventScroll: true });
}

/**
 * Hidden controls ask for the full screen and leave it again; leaving it another way brings the
 * controls back. The canvas keeps the focus so the arrow keys go on working.
 */
export function useHideMode(): void {
  const hidden = useFlowStore((s) => s.ui.controlsHidden);
  const presenter = useFlowStore((s) => s.ui.presenter);
  const before = useRef({ hidden, presenter });
  const enteredFullscreen = useRef(false);

  useEffect(() => {
    const was = before.current;
    before.current = { hidden, presenter };
    if (was.hidden === hidden && was.presenter === presenter) return;
    if (hidden && !was.hidden && 'requestFullscreen' in document.documentElement && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(
        () => {
          enteredFullscreen.current = true;
        },
        () => {
          enteredFullscreen.current = false;
        },
      );
    }
    if (!hidden && enteredFullscreen.current) {
      enteredFullscreen.current = false;
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    }
    if (presenter) announce('Presenter mode. Arrow keys step, Escape leaves.');
    else if (was.presenter) announce('Presenter mode off');
    else announce(hidden ? 'Controls hidden. Press Escape to show them.' : 'Controls shown');
    focusCanvas();
  }, [hidden, presenter]);

  useEffect(() => {
    const onChange = () => {
      if (document.fullscreenElement || !enteredFullscreen.current) return;
      enteredFullscreen.current = false;
      useFlowStore.getState().setUi({ controlsHidden: false, presenter: false });
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
    };
  }, []);
}
