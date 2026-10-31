import { useRef, type CSSProperties } from 'react';

import { cx } from '../../shared/lib/util.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { BehindPopover } from './BehindPopover.tsx';
import { BookmarksPopover } from './BookmarksPopover.tsx';
import { Cards } from './Cards.tsx';
import { ChaptersNav } from './ChaptersNav.tsx';
import { FollowStrip } from './FollowStrip.tsx';
import { PathSelect } from './PathSelect.tsx';
import { ProgressBar } from './ProgressBar.tsx';
import { ResizeHandle } from './ResizeHandle.tsx';
import { useWheelStep } from './useWheelStep.ts';
import styles from './walkbar.module.css';

/** The footer: chapters, Follow, path filter, Behind and bookmarks, progress, and the three cards. */
export function WalkBar() {
  const flow = useFlowStore((s) => s.flow);
  const cardH = useFlowStore((s) => s.settings.cardH);
  const barRef = useRef<HTMLElement | null>(null);
  const centreRef = useRef<HTMLDivElement | null>(null);
  const onWheel = useWheelStep(centreRef);

  if (!flow) return <footer id="wbar" className={styles.bar} aria-label="Walkthrough" />;

  const sized = cardH !== undefined;
  const style = sized ? ({ '--card-h': `${cardH}px` } as CSSProperties) : undefined;

  return (
    <footer
      ref={barRef}
      id="wbar"
      className={cx(styles.bar, sized && styles.sized)}
      aria-label="Walkthrough"
      style={style}
      onWheel={onWheel}
    >
      <ResizeHandle barRef={barRef} />
      {flow.isSequence ? (
        <>
          <div className={styles.top}>
            <ChaptersNav flow={flow} />
            <FollowStrip />
            <PathSelect flow={flow} />
            <BehindPopover flow={flow} />
            <BookmarksPopover flow={flow} />
          </div>
          <ProgressBar flow={flow} />
          <Cards flow={flow} centreRef={centreRef} />
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
