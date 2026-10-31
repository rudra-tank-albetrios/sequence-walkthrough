import type { Step } from '@swv/core';

import { Chip } from '../../shared/ui/Chip.tsx';
import { TermText } from '../../shared/ui/TermText.tsx';
import styles from './card.module.css';
import { RefChip } from './StepFacts.tsx';
import { usesSummary } from './steps.ts';

/** "Also involved: 2 hooks · 1 util": the side parts a step uses, with their code references. */
export function UsesStrip({ step }: { step: Step }) {
  if (step.uses.length === 0) return null;
  return (
    <details className={styles.uses} data-testid="uses" data-tour="side-parts">
      <summary>Also involved: {usesSummary(step.uses)}</summary>
      <ul>
        {step.uses.map((u, i) => (
          <li key={i}>
            <Chip tone="follow">{u.kind}</Chip>
            <b>{u.name}</b>
            {u.ref ? <RefChip value={u.ref} /> : null}
            {u.text ? (
              <span className={styles.uText}>
                <TermText text={u.text} />
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}
