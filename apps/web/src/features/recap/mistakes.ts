import type { WeakPoint } from '../../shared/storage/weakPoints.ts';
import { inPeriod, type RecapPeriod } from './period.ts';

/** What a recap covers: a period, for one flow or (`flowId: null`) for all flows. */
export interface RecapSelection {
  period: RecapPeriod;
  flowId: string | null;
}

/** The mistakes a selection covers: the most missed first, then the latest. */
export function selectMistakes(
  points: readonly WeakPoint[],
  { period, flowId }: RecapSelection,
  now: Date,
): WeakPoint[] {
  return points
    .filter(
      (point) =>
        (flowId === null || point.flowId === flowId) &&
        inPeriod(Date.parse(point.date), period, now),
    )
    .sort((a, b) => b.timesMissed - a.timesMissed || b.date.localeCompare(a.date));
}
