/** The periods a recap can cover. Days are local calendar days, as the person sees them. */
export type RecapPeriod = 'today' | 'week' | 'all';

export const PERIODS: readonly { id: RecapPeriod; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Last 7 days' },
  { id: 'all', label: 'All time' },
];

/** How many days before today each period reaches back. */
const DAYS_BACK = { today: 0, week: 6 } as const;

/** The first moment a period includes: "Last 7 days" is today and the six days before it. */
export function periodStart(period: RecapPeriod, now: Date): number {
  if (period === 'all') return Number.NEGATIVE_INFINITY;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - DAYS_BACK[period]);
  return start.getTime();
}

export const inPeriod = (time: number, period: RecapPeriod, now: Date): boolean =>
  time >= periodStart(period, now);
