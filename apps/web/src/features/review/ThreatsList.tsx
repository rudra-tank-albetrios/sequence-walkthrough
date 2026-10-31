import { THREAT_LEVELS, type FlowThreat } from '@swv/core';

import { ThreatChip } from '../../shared/ui/ThreatChip.tsx';
import styles from './review.module.css';
import { StepButton } from './StepButton.tsx';

/** The flow's `@threat` lines, most serious first, each linked to its step. */
export function ThreatsList({ threats }: { threats: readonly FlowThreat[] }) {
  if (threats.length === 0) {
    return (
      <p className={styles.muted} data-testid="review-threats">
        No threat is noted in this flow. That does not mean it is safe: threats come only from what
        the diagram&apos;s author saw in the code.
      </p>
    );
  }
  const sorted = [...threats].sort(
    (a, b) => THREAT_LEVELS.indexOf(a.level) - THREAT_LEVELS.indexOf(b.level) || a.step - b.step,
  );
  return (
    <div data-testid="review-threats">
      <p className={styles.note}>
        Each one is a possible problem to check in the code, not a confirmed fault.
      </p>
      <ul className={styles.list}>
        {sorted.map((threat, i) => (
          <li key={i} className={styles.finding}>
            <ThreatChip threat={threat} />
            <span className={styles.message}>{threat.text}</span>
            <span className={styles.steps}>
              <StepButton index={threat.step} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
