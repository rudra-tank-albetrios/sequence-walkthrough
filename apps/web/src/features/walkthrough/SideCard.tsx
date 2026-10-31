import type { Step } from '@swv/core';

import { useFlowStore } from '../../shared/state/flowStore.ts';
import { pathVisible } from '../../shared/state/path.ts';
import { cx } from './cx.ts';
import { shortRoute } from './steps.ts';
import styles from './walkbar.module.css';

/** The small card on either side of the centre: a glance at the previous or next step. */
export function SideCard({ step, testId }: { step: Step | undefined; testId: string }) {
  const go = useFlowStore((s) => s.go);
  const path = useFlowStore((s) => s.path);
  if (!step) return <div className={cx(styles.card, styles.side, styles.empty)} aria-hidden="true" data-testid={testId} />;
  return (
    <button
      type="button"
      className={cx(styles.card, styles.side, !pathVisible(step, path) && styles.off)}
      aria-label={`Go to step ${step.n}`}
      data-testid={testId}
      onClick={() => go(step.idx)}
    >
      <span className={styles.sideH}>Step {step.n}</span>
      <span className={styles.sideR}>{shortRoute(step)}</span>
      <span className={cx(styles.sideS, 'mono')}>{step.label.join(' ')}</span>
      <span className={styles.sideD}>{step.explain}</span>
    </button>
  );
}
