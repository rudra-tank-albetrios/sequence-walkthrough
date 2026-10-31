import type { Flow, Step } from '@swv/core';
import type { CSSProperties } from 'react';

import { cx } from '../../shared/lib/util.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { pathVisible } from '../../shared/state/path.ts';
import { shortRoute } from './steps.ts';
import styles from './walkbar.module.css';

/** The small card on either side of the centre: a glance at the previous or next step. */
export function SideCard({ flow, step, testId }: { flow: Flow; step: Step | undefined; testId: string }) {
  const go = useFlowStore((s) => s.go);
  const path = useFlowStore((s) => s.path);
  if (!step) return <div className={cx(styles.card, styles.side, styles.empty)} aria-hidden="true" data-testid={testId} />;
  const hue = flow.sections[step.section]?.hue;
  return (
    <button
      type="button"
      className={cx(styles.card, styles.side, !pathVisible(step, path) && styles.off)}
      style={hue === undefined ? undefined : ({ '--ch': hue } as CSSProperties)}
      aria-label={`Go to step ${String(step.n)}`}
      data-testid={testId}
      onClick={() => {
        go(step.idx);
      }}
    >
      <span className={styles.sideH}>
        <span className="sr-only">Go to </span>Step {step.n}
      </span>
      <span className={styles.sideR}>{shortRoute(step)}</span>
      <span className={cx(styles.sideS, 'mono')}>{step.label.join(' ')}</span>
      <span className={styles.sideD}>{step.explain}</span>
    </button>
  );
}
