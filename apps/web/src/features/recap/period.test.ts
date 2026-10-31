import { describe, expect, it } from 'vitest';

import { inPeriod, periodStart } from './period.ts';

/** Local time, so the tests mean the same thing in every time zone. */
const at = (day: number, hour = 0, minute = 0, second = 0, ms = 0) =>
  new Date(2026, 9, day, hour, minute, second, ms);

describe('periods', () => {
  const now = at(31, 15, 30);

  it('today starts at local midnight, not 24 hours ago', () => {
    expect(periodStart('today', now)).toBe(at(31).getTime());
    expect(inPeriod(at(31).getTime(), 'today', now)).toBe(true);
    expect(inPeriod(at(30, 23, 59, 59, 999).getTime(), 'today', now)).toBe(false);
  });

  it('last 7 days is today and the six days before it', () => {
    expect(periodStart('week', now)).toBe(at(25).getTime());
    expect(inPeriod(at(25).getTime(), 'week', now)).toBe(true);
    expect(inPeriod(at(24, 23, 59, 59, 999).getTime(), 'week', now)).toBe(false);
  });

  it('crosses a month boundary', () => {
    const early = new Date(2026, 10, 2, 9);
    expect(periodStart('week', early)).toBe(new Date(2026, 9, 27).getTime());
  });

  it('all time includes everything', () => {
    expect(inPeriod(0, 'all', now)).toBe(true);
  });
});
