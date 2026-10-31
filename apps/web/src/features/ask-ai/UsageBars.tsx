import { formatReset, usageView, type ModelEntry, type UsageRecord } from '@swv/ai';
import { useEffect, useState } from 'react';

import { Tooltip, TooltipProvider } from '../../shared/ui/Tooltip.tsx';
import { useAiStore } from './aiStore.ts';
import styles from './usage.module.css';

/** The bars follow the clock, because a limit fills up again at its reset time. */
function useMinuteClock(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
    }, 60_000);
    return () => {
      clearInterval(id);
    };
  }, []);
  return now;
}

export interface UsageBarProps {
  model: ModelEntry;
  record: UsageRecord | undefined;
  /** For a place that already shows the model's name. */
  hideName?: boolean;
}

/** One model's usage. The percentage and what is left are always text; hover adds limit and reset. */
export function UsageBar({ model, record, hideName = false }: UsageBarProps) {
  const clock = useMinuteClock();
  const readAt = useAiStore((s) => s.readAt);
  const now = Math.max(clock, readAt);
  const view = usageView(model, record, now);
  const reset = view.resetAt === null ? '' : ` Clears at ${formatReset(view.resetAt, now)}.`;
  const hover = `${view.label}. ${view.detail}${reset}`;
  const percent = view.percentUsed === null ? null : Math.round(view.percentUsed);
  return (
    <TooltipProvider>
      <Tooltip content={hover} side="top">
        <div
          className={styles.usage}
          role="group"
          aria-label={`${model.name} usage`}
          tabIndex={0}
          data-testid="usage-bar"
          data-level={view.level}
        >
          {hideName ? null : <span className={styles.name}>{model.name}</span>}
          {percent === null ? null : (
            <span
              className={styles.track}
              role="meter"
              aria-label={`${model.name} used`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-valuetext={view.text}
            >
              <span className={styles.fill} style={{ width: `${percent}%` }} />
            </span>
          )}
          <span className={styles.text}>{view.text}</span>
          <span className={styles.label}>{view.label}</span>
        </div>
      </Tooltip>
    </TooltipProvider>
  );
}

/** One bar per saved model. Nothing is shown before a model is saved. */
export function UsageBars() {
  const models = useAiStore((s) => s.state.models);
  const usage = useAiStore((s) => s.usage);
  if (!models.length) return null;
  return (
    <div className={styles.bars} data-testid="usage-bars">
      {models.map((model) => (
        <UsageBar key={model.id} model={model} record={usage[model.id]} />
      ))}
    </div>
  );
}
