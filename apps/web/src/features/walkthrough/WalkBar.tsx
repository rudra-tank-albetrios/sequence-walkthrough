import { useCallback, useRef, useState, type CSSProperties } from 'react';

import { useFlowStore } from '../../shared/state/flowStore.ts';
import { Cards } from './Cards.tsx';
import { Dock } from './Dock.tsx';
import { FollowStrip } from './FollowStrip.tsx';
import { ResizeHandle } from './ResizeHandle.tsx';
import { SidePartsDialog } from './SidePartsDialog.tsx';
import { useWheelStep } from './useWheelStep.ts';
import styles from './walkbar.module.css';
import { HOLD_MS } from './wheelGate.ts';

export interface WalkBarProps {
  /** The fold tab put the cards away: the dock stays, and the diagram takes the room. */
  deckFolded?: boolean;
}

/** Shows that a scroll was taken: the step it landed on, and a line that runs out when the next one counts. */
function ScrollCue({ cue, total }: { cue: { id: number; direction: 1 | -1 }; total: number }) {
  const cur = useFlowStore((s) => s.cur);
  return (
    <div
      key={cue.id}
      className={styles.cue}
      data-testid="scroll-cue"
      aria-hidden="true"
      style={{ '--hold': `${String(HOLD_MS)}ms` } as CSSProperties}
    >
      {cue.direction > 0 ? '↓' : '↑'} {cur < 0 ? 'Overview' : `Step ${String(cur + 1)} of ${String(total)}`}
      <i />
    </div>
  );
}

/** The bottom of the page: the deck of step cards floating over the full-width dock with the Flow Rail. */
export function WalkBar({ deckFolded = false }: WalkBarProps) {
  const flow = useFlowStore((s) => s.flow);
  const cardH = useFlowStore((s) => s.settings.cardH);
  const barRef = useRef<HTMLElement | null>(null);
  const centreRef = useRef<HTMLDivElement | null>(null);
  const [cue, setCue] = useState<{ id: number; direction: 1 | -1 } | null>(null);
  const onStep = useCallback((direction: 1 | -1) => {
    setCue((old) => ({ id: (old?.id ?? 0) + 1, direction }));
  }, []);
  const onWheel = useWheelStep(centreRef, onStep);

  if (!flow) return <footer id="wbar" className={styles.bar} aria-label="Walkthrough" data-chrome="bottom" />;

  const style = cardH === undefined ? undefined : ({ '--card-h': `${String(cardH)}px` } as CSSProperties);

  return (
    <footer
      ref={barRef}
      id="wbar"
      className={styles.bar}
      aria-label="Walkthrough"
      data-chrome="bottom"
      style={style}
      onWheel={onWheel}
    >
      {flow.isSequence ? (
        <>
          <FollowStrip />
          {cue ? <ScrollCue key={cue.id} cue={cue} total={flow.steps.length} /> : null}
          {deckFolded ? null : (
            <div className={styles.deck} data-tour="deck">
              <ResizeHandle barRef={barRef} />
              <Cards flow={flow} centreRef={centreRef} />
            </div>
          )}
          <Dock flow={flow} />
          <SidePartsDialog flow={flow} />
        </>
      ) : (
        <div className={styles.offline} role="status">
          This is a <b>{flow.diagramType}</b> diagram. The walkthrough, pinned header and table work with sequence
          diagrams, so only pan and zoom are on.
        </div>
      )}
    </footer>
  );
}
