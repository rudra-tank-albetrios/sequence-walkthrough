import { describe, expect, it } from 'vitest';

import { clockView, formatClock, timeLine, validMinutes } from './clock.ts';

const timer = (minutes: number) => ({ kind: 'timer', minutes }) as const;
const stopwatch = { kind: 'stopwatch' } as const;

describe('the clock', () => {
  it('counts up for a stopwatch, with no limit', () => {
    const view = clockView(stopwatch, 1000, 91_000);
    expect(view).toEqual({ elapsedMs: 90_000, remainingMs: null, warning: false, expired: false });
  });

  it('counts down for a timer', () => {
    const view = clockView(timer(5), 0, 60_000);
    expect(view.remainingMs).toBe(240_000);
    expect(view.warning).toBe(false);
    expect(view.expired).toBe(false);
  });

  it('warns for the last minute', () => {
    expect(clockView(timer(5), 0, 239_999).warning).toBe(false);
    expect(clockView(timer(5), 0, 240_000).warning).toBe(true);
    expect(clockView(timer(5), 0, 299_999).warning).toBe(true);
  });

  it('warns for the last fifth of a short timer', () => {
    expect(clockView(timer(1), 0, 47_999).warning).toBe(false);
    expect(clockView(timer(1), 0, 48_000).warning).toBe(true);
  });

  it('expires at zero, stops there and no longer warns', () => {
    const view = clockView(timer(5), 0, 300_000);
    expect(view).toEqual({ elapsedMs: 300_000, remainingMs: 0, warning: false, expired: true });
    expect(clockView(timer(5), 0, 900_000).elapsedMs).toBe(300_000);
  });

  it('does not run backwards if the computer clock does', () => {
    expect(clockView(stopwatch, 5000, 1000).elapsedMs).toBe(0);
  });

  it('formats time', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65_400)).toBe('1:05');
    expect(formatClock(3_729_000)).toBe('1:02:09');
    expect(formatClock(1)).toBe('0:00');
    expect(formatClock(1, true)).toBe('0:01');
  });

  it('accepts whole custom minutes from 1 to 180', () => {
    expect(validMinutes('1')).toBe(1);
    expect(validMinutes('180')).toBe(180);
    for (const bad of ['0', '181', '2.5', 'abc', '-3', '1e9', '']) expect(validMinutes(bad)).toBeNull();
  });

  it('says how long a quiz took', () => {
    expect(timeLine({ kind: 'off' }, 0, 5000, false)).toBe('Not timed.');
    expect(timeLine(stopwatch, 0, 65_000, false)).toBe('Time: 1:05.');
    expect(timeLine(timer(1), 0, 60_000, true)).toBe(
      'Time: 1:00. The time ran out, so your answers were submitted.',
    );
  });
});
