import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useDiagramStore } from '../../shared/state/diagramStore.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { closeDemo, openDemo, showStop, type SavedView } from './session.ts';
import { TOUR_STOPS, type TourStop } from './stops.ts';
import { TourCard } from './TourCard.tsx';
import styles from './tour.module.css';
import { useTarget } from './useTarget.ts';
import { shouldStartByItself } from './visit.ts';

/** Space around the target, so the spotlight does not touch it. */
const SPOT_PAD = 4;

interface StopViewProps {
  stop: TourStop;
  index: number;
  onMove: (index: number) => void;
  onEnd: () => void;
}

/** One stop: the dimmed page with a hole over the target, then the card. Keyed by stop. */
function StopView({ stop, index, onMove, onEnd }: StopViewProps) {
  const { box, settled } = useTarget(stop.target);
  const spot = box
    ? {
        left: box.left - SPOT_PAD,
        top: box.top - SPOT_PAD,
        width: box.width + SPOT_PAD * 2,
        height: box.height + SPOT_PAD * 2,
      }
    : null;
  return (
    <>
      {createPortal(
        <div
          className={`${styles.blocker} ${spot ? '' : styles.dim}`}
          data-testid="tour-backdrop"
          aria-hidden="true"
        >
          {spot ? <div className={styles.spot} style={spot} data-testid="tour-spotlight" /> : null}
        </div>,
        document.body,
      )}
      {settled ? (
        <TourCard
          // A target that turns up late may be inside a feature's dialog, so the card opens again on top.
          key={box ? 'on-target' : 'centred'}
          stop={stop}
          index={index}
          total={TOUR_STOPS.length}
          box={box}
          onBack={() => onMove(index - 1)}
          onNext={() => onMove(index + 1)}
          onEnd={onEnd}
        />
      ) : null}
    </>
  );
}

/** Mounted while the tour is open. It needs no key and no network: it only moves the store. */
function TourRun() {
  const [index, setIndex] = useState(0);
  const saved = useRef<SavedView | null>(null);
  const drawing = useDiagramStore((s) => s.rendering || (s.cleanSvg === '' && s.error === null));
  const stop = TOUR_STOPS[index];

  useEffect(() => {
    saved.current ??= openDemo();
  }, []);

  useEffect(() => {
    if (stop) showStop(stop);
  }, [stop]);

  if (!stop || drawing) return null;
  return (
    <StopView
      key={stop.id}
      stop={stop}
      index={index}
      onMove={setIndex}
      onEnd={() => {
        if (saved.current) closeDemo(saved.current);
      }}
    />
  );
}

/** The guided tour (plan section 8.12): opened by `ui.tourOpen`, and once by itself. */
export function Tour() {
  const open = useFlowStore((s) => s.ui.tourOpen);
  const flow = useFlowStore((s) => s.flow);
  const checked = useRef(false);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!flow || checked.current) return;
    checked.current = true;
    const { code, setUi } = useFlowStore.getState();
    if (shouldStartByItself(code, window.location.hash)) setUi({ tourOpen: true });
  }, [flow]);

  // Focus goes back to the button that opened the tour.
  useEffect(() => {
    if (open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    } else if (opener.current?.isConnected) {
      opener.current.focus();
      opener.current = null;
    }
  }, [open]);

  return open ? <TourRun /> : null;
}
