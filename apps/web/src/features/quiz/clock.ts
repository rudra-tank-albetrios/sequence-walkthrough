import type { TimeMode } from './types.ts';

/** What the quiz's clock shows. Worked out from the wall clock, so a sleeping tab cannot drift it. */

export interface ClockView {
  elapsedMs: number;
  /** Time left on a timer; null for the stopwatch and for no clock. */
  remainingMs: number | null;
  /** The timer is near its end. */
  warning: boolean;
  /** The timer has reached zero. */
  expired: boolean;
}

/** The warning shows for the last minute, or the last fifth of a short timer. */
const warnAtMs = (limitMs: number): number => Math.min(60_000, limitMs / 5);

export function clockView(time: TimeMode, startedAt: number, now: number): ClockView {
  const elapsedMs = Math.max(0, now - startedAt);
  if (time.kind !== 'timer') {
    return { elapsedMs, remainingMs: null, warning: false, expired: false };
  }
  const limitMs = time.minutes * 60_000;
  const remainingMs = Math.max(0, limitMs - elapsedMs);
  return {
    elapsedMs: Math.min(elapsedMs, limitMs),
    remainingMs,
    warning: remainingMs > 0 && remainingMs <= warnAtMs(limitMs),
    expired: remainingMs === 0,
  };
}

/** `4:05`, or `1:02:09` from an hour. A timer rounds up so it reads `0:00` only at zero. */
export function formatClock(ms: number, roundUp = false): string {
  const seconds = roundUp ? Math.ceil(ms / 1000) : Math.floor(ms / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** The time line of a result. */
export function timeLine(
  time: TimeMode,
  startedAt: number,
  finishedAt: number,
  autoSubmitted: boolean,
): string {
  const taken =
    time.kind === 'off' ? 'Not timed.' : `Time: ${formatClock(clockView(time, startedAt, finishedAt).elapsedMs)}.`;
  return autoSubmitted ? `${taken} The time ran out, so your answers were submitted.` : taken;
}

/** The custom timer's limits, in whole minutes. */
export const CUSTOM_MINUTES = { min: 1, max: 180 } as const;

export function validMinutes(raw: string): number | null {
  const minutes = Number(raw);
  return Number.isInteger(minutes) && minutes >= CUSTOM_MINUTES.min && minutes <= CUSTOM_MINUTES.max
    ? minutes
    : null;
}
