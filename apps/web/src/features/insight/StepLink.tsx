import { STATUS_TEXT } from '@swv/core';

import { cx } from '../../shared/lib/util.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { Chip } from '../../shared/ui/Chip.tsx';
import { statusTone } from './derive.ts';
import styles from './insight.module.css';

/** "step N" (or just the number as a chip) that jumps to the step; the current step is marked. */
export function StepLink({ index, chip = false }: { index: number; chip?: boolean }) {
  const cur = useFlowStore((s) => s.cur);
  const go = useFlowStore((s) => s.go);
  const n = useFlowStore((s) => s.flow?.steps[index]?.n) ?? index + 1;
  const current = index === cur;
  return (
    <button
      type="button"
      className={cx(chip ? styles.stepChip : styles.stepLink, current && styles.cur)}
      data-go={index}
      aria-label={`Go to step ${n}`}
      {...(current ? { 'aria-current': 'step' as const } : {})}
      onClick={() => go(index)}
    >
      {chip ? n : `step ${n}`}
    </button>
  );
}

/** A reply's status as a coloured chip that jumps to the reply; the title explains the code. */
export function StatusChip({ index, codeOnly = false }: { index: number; codeOnly?: boolean }) {
  const step = useFlowStore((s) => s.flow?.steps[index]);
  const cur = useFlowStore((s) => s.cur);
  const go = useFlowStore((s) => s.go);
  if (!step) return null;
  const code = step.status?.code;
  const title = code === undefined ? undefined : STATUS_TEXT[code];
  const current = index === cur;
  return (
    <Chip
      tone={statusTone(code)}
      className={cx(styles.st, current && styles.cur)}
      data-go={index}
      {...(title ? { title } : {})}
      {...(current ? { 'aria-current': 'step' as const } : {})}
      onClick={() => go(index)}
    >
      {codeOnly && code !== undefined ? code : step.label[0]}
    </Chip>
  );
}
