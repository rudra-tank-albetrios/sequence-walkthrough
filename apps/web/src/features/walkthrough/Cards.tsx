import type { Flow } from '@swv/core';
import { useEffect, useRef, type RefObject } from 'react';

import { useReducedMotion } from '../../shared/hooks/useMediaQuery.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { Button } from '../../shared/ui/Button.tsx';
import { toast } from '../../shared/ui/toast.ts';
import { cx } from './cx.ts';
import { OverviewCard } from './OverviewCard.tsx';
import { SideCard } from './SideCard.tsx';
import { StepCard } from './StepCard.tsx';
import { neighbour } from './steps.ts';
import styles from './walkbar.module.css';

/** Prev button, previous card, centre card, next card, next button. Slides on a step change. */
export function Cards({ flow, centreRef }: { flow: Flow; centreRef: RefObject<HTMLDivElement | null> }) {
  const cur = useFlowStore((s) => s.cur);
  const path = useFlowStore((s) => s.path);
  const chapterLock = useFlowStore((s) => s.chapterLock);
  const prev = useFlowStore((s) => s.prev);
  const next = useFlowStore((s) => s.next);
  const reduced = useReducedMotion();
  const cardsRef = useRef<HTMLDivElement | null>(null);
  const lastCur = useRef(cur);

  // Replay the slide on every step change, as version 2 did, without re-mounting the cards.
  useEffect(() => {
    const el = cardsRef.current;
    if (lastCur.current === cur) return;
    const direction = cur > lastCur.current ? 'slide-next' : 'slide-prev';
    lastCur.current = cur;
    if (!el || reduced) return;
    el.classList.remove('slide-next', 'slide-prev');
    el.getBoundingClientRect(); // forces a layout so the animation restarts
    el.classList.add(direction);
  }, [cur, reduced]);

  const n = flow.steps.length;
  const step = flow.steps[cur];
  const prevIndex = cur < 0 ? -1 : neighbour(flow, cur, -1, path, chapterLock);
  const firstVisible = neighbour(flow, -1, 1, path, false);
  const nextIndex = cur < 0 ? (firstVisible < 0 ? 0 : firstVisible) : neighbour(flow, cur, 1, path, chapterLock);
  const move = (direction: 1 | -1) => {
    const message = direction === 1 ? next() : prev();
    if (message) toast(message);
  };

  return (
    <div ref={cardsRef} className={styles.cards} data-testid="cards">
      <Button icon className={styles.nav} aria-label="Previous step" disabled={cur < 0} onClick={() => move(-1)}>
        ◀
      </Button>
      <SideCard step={prevIndex >= 0 ? flow.steps[prevIndex] : undefined} testId="card-prev" />
      <div ref={centreRef} className={cx(styles.card, styles.centre)} data-testid="card-cur">
        {step ? <StepCard flow={flow} step={step} /> : <OverviewCard flow={flow} />}
      </div>
      <SideCard step={nextIndex >= 0 ? flow.steps[nextIndex] : undefined} testId="card-next" />
      <Button icon className={styles.nav} aria-label="Next step" disabled={cur >= n - 1} onClick={() => move(1)}>
        ▶
      </Button>
    </div>
  );
}
