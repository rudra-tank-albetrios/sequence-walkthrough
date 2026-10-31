import { useRef, type CSSProperties, type ReactNode } from 'react';

import { useFlowStore } from '../../shared/state/flowStore.ts';
import { Cards } from './Cards.tsx';
import { Dock } from './Dock.tsx';
import { FollowStrip } from './FollowStrip.tsx';
import { ResizeHandle } from './ResizeHandle.tsx';
import { useWheelStep } from './useWheelStep.ts';
import styles from './walkbar.module.css';

export interface WalkBarProps {
  /** The fold tab put the cards away: the dock stays, and the diagram takes the room. */
  deckFolded?: boolean;
  /** Sits in the transport beside Play: the voice control. */
  besidePlay?: ReactNode;
  /** Sits on the step card beside Ask AI: the usage bar. */
  besideAsk?: ReactNode;
}

/** The floating bottom of the page: the deck of step cards above the dock with the Flow Rail. */
export function WalkBar({ deckFolded = false, besidePlay, besideAsk }: WalkBarProps) {
  const flow = useFlowStore((s) => s.flow);
  const cardH = useFlowStore((s) => s.settings.cardH);
  const barRef = useRef<HTMLElement | null>(null);
  const centreRef = useRef<HTMLDivElement | null>(null);
  const onWheel = useWheelStep(centreRef);

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
          {deckFolded ? null : (
            <div className={styles.deck} data-tour="deck">
              <ResizeHandle barRef={barRef} />
              <Cards flow={flow} centreRef={centreRef} besideAsk={besideAsk} />
            </div>
          )}
          <Dock flow={flow} besidePlay={besidePlay} />
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
