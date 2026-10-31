import { modelProblem, type ModelEntry, type ModelState } from './models.ts';
import { standing, type UsageRecord } from './usage.ts';

/** Why the first choice was passed over before anything was sent. */
export type SkipReason = 'low' | 'out' | 'not-ready';

export interface Skip {
  model: ModelEntry;
  reason: SkipReason;
}

export interface Route {
  /** Every model that could receive this request: the active one and marked fallbacks. */
  candidates: ModelEntry[];
  /** The order to try them in. Each model appears once, so a request can never loop. */
  attempts: ModelEntry[];
  /** Models passed over, for the notice. */
  skipped: Skip[];
  /** The soonest time a used-up candidate clears. */
  earliestReset: number | null;
}

const earlier = (a: number | null, b: number | null): number | null => {
  if (a === null) return b;
  return b === null ? a : Math.min(a, b);
};

/**
 * Plan section 8.3. The active model comes first, then the models marked as fallbacks in list
 * order. Others are never used. A model at or under the switch level waits behind the healthy
 * ones and is still used when nothing better is left. A used-up model is left out until its reset,
 * so the first model returns on its own.
 */
export function planRoute(
  state: ModelState,
  usage: Readonly<Partial<Record<string, UsageRecord>>>,
  now: number,
): Route {
  const active = state.models.find((m) => m.id === state.activeId);
  const others = state.models.filter((m) => m.fallback && m.id !== state.activeId);
  const skipped: Skip[] = [];
  const candidates: ModelEntry[] = [];
  for (const model of active ? [active, ...others] : others) {
    if (modelProblem(model)) {
      if (model === active) skipped.push({ model, reason: 'not-ready' });
    } else {
      candidates.push(model);
    }
  }

  const healthy: ModelEntry[] = [];
  const low: ModelEntry[] = [];
  let earliestReset: number | null = null;
  for (const model of candidates) {
    const stands = standing(model, usage[model.id], state.switchAt, now);
    if (stands.state === 'ok') {
      healthy.push(model);
    } else if (stands.state === 'low') {
      low.push(model);
    } else {
      earliestReset = earlier(earliestReset, stands.resetAt);
      skipped.push({ model, reason: 'out' });
    }
  }
  if (healthy.length) for (const model of low) skipped.push({ model, reason: 'low' });
  return { candidates, attempts: [...healthy, ...low], skipped, earliestReset };
}
