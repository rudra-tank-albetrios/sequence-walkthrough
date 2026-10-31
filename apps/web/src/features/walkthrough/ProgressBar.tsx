import type { Flow, Section } from '@swv/core';
import type { CSSProperties } from 'react';

import { cx, plural } from '../../shared/lib/util.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { pathVisible } from '../../shared/state/path.ts';
import styles from './walkbar.module.css';

/**
 * One segment per chapter in its hue, one cell per step: filled up to the current step, dimmer
 * where the path filter hides a step. A click on a segment jumps to its chapter.
 */
export function ProgressBar({ flow }: { flow: Flow }) {
  const cur = useFlowStore((s) => s.cur);
  const path = useFlowStore((s) => s.path);
  const go = useFlowStore((s) => s.go);
  const n = flow.steps.length;
  if (n === 0) return null;
  const sections: Section[] =
    flow.sections.length > 0
      ? flow.sections
      : [{ name: flow.title, firstStep: 0, count: n, hue: 210, idx: 0, line: -1, summary: '' }];
  return (
    <div className={styles.progress} role="group" aria-label={`Progress: step ${cur + 1} of ${n}`} data-testid="progress">
      {sections.map((sec) => {
        const isCur = cur >= sec.firstStep && cur < sec.firstStep + sec.count;
        const steps = flow.steps.slice(sec.firstStep, sec.firstStep + sec.count);
        const threats = steps.filter((step) => step.threats.length > 0).length;
        return (
          <button
            key={sec.idx}
            type="button"
            className={cx(styles.seg, isCur && styles.cur)}
            style={{ '--ch': sec.hue, flexGrow: sec.count, flexBasis: 0 } as CSSProperties}
            title={`${sec.name}: ${plural(sec.count, 'step')}${threats ? `, ${plural(threats, 'step')} with a threat` : ''}`}
            aria-label={`Go to ${sec.name}`}
            data-testid="progress-seg"
            onClick={() => go(sec.firstStep)}
          >
            {steps.map((step) => {
              const hidden = !pathVisible(step, path);
              const threat = step.threats.length > 0;
              return (
                <span
                  key={step.idx}
                  className={cx(
                    styles.cell,
                    step.idx <= cur && styles.done,
                    hidden && styles.off,
                    threat && styles.threat,
                  )}
                  {...(hidden ? { 'data-hidden': '' } : {})}
                  {...(threat ? { 'data-threat': '' } : {})}
                />
              );
            })}
          </button>
        );
      })}
    </div>
  );
}
