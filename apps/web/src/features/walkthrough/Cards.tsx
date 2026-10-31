import type { Flow } from '@swv/core';
import { useEffect, useRef, type CSSProperties, type RefObject } from 'react';

import { cx } from '../../shared/lib/util.ts';
import { useReducedMotion } from '../../shared/hooks/useMediaQuery.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { OverviewCard } from './OverviewCard.tsx';
import { SideCard } from './SideCard.tsx';
import { StepCard } from './StepCard.tsx';
import { neighbour } from './steps.ts';
import styles from './walkbar.module.css';

/** Previous card, centre card, next card. Slides on a step change. */
export function Cards(props: { flow: Flow; centreRef: RefObject<HTMLDivElement | null> }) {
  const { flow, centreRef } = props;
  const cur = useFlowStore((s) => s.cur);
  const path = useFlowStore((s) => s.path);
  const chapterLock = useFlowStore((s) => s.chapterLock);
  const reduced = useReducedMotion();
  const cardsRef = useRef<HTMLDivElement | null>(null);
  const lastCur = useRef(cur);

  // Replay the slide on every step change, as version 2 did, without re-mounting the cards.
  useEffect(() => {
    const el = cardsRef.current;
    if (lastCur.current === cur) return;
    const direction = cur > lastCur.current ? 'slide-next' : 'slide-prev';
    lastCur.current = cur;
    if (centreRef.current) centreRef.current.scrollTop = 0;
    if (!el || reduced) return;
    el.classList.remove('slide-next', 'slide-prev');
    el.getBoundingClientRect(); // forces a layout so the animation restarts
    el.classList.add(direction);
  }, [cur, reduced, centreRef]);

  const step = flow.steps[cur];
  const prevIndex = cur < 0 ? -1 : neighbour(flow, cur, -1, path, chapterLock);
  const firstVisible = neighbour(flow, -1, 1, path, false);
  const nextIndex = cur < 0 ? (firstVisible < 0 ? 0 : firstVisible) : neighbour(flow, cur, 1, path, chapterLock);
  const hue = step ? flow.sections[step.section]?.hue : undefined;

  return (
    <div ref={cardsRef} className={styles.cards} data-testid="cards">
      <SideCard flow={flow} step={prevIndex >= 0 ? flow.steps[prevIndex] : undefined} testId="card-prev" />
      <div
        ref={centreRef}
        className={cx(styles.card, styles.centre)}
        style={hue === undefined ? undefined : ({ '--ch': hue } as CSSProperties)}
        data-testid="card-cur"
        data-tour="step-card"
      >
        {step ? <StepCard flow={flow} step={step} /> : <OverviewCard flow={flow} />}
      </div>
      <SideCard flow={flow} step={nextIndex >= 0 ? flow.steps[nextIndex] : undefined} testId="card-next" />
    </div>
  );
}
