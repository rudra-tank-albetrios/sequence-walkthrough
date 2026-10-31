/**
 * Reads the rate-limit headers a provider chose to expose. Groq, Cerebras, Mistral and others name
 * them differently, so the names are matched by pattern: `x-ratelimit-limit-tokens-minute` is the
 * limit of the window `tokens-minute`. A browser sees only headers the provider exposes through
 * CORS; when it sees none, the usage bar falls back to counting in the browser.
 */
type RateUnit = 'requests' | 'tokens' | 'credits';

/** One limit a provider reports, such as requests per day. */
export interface RateWindow {
  /** What the limit is, as shown on hover: `tokens per minute`. */
  name: string;
  unit: RateUnit;
  limit: number;
  remaining: number;
  /** When it fills up again, in milliseconds since 1970, or null when nobody said. */
  resetAt: number | null;
}

const RATE_HEADER = /^(?:x-)?ratelimit-(limit|remaining|reset)(?:-(.+))?$/;
const DURATION = /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m(?!s))?(?:(\d+(?:\.\d+)?)s)?(?:(\d+(?:\.\d+)?)ms)?$/;
const PERIOD_MS: Record<string, number> = { second: 1000, minute: 60_000, hour: 3_600_000, day: 86_400_000 };

/**
 * A reset or Retry-After value as a time. Accepts durations (`2m59.56s`, `7.66s`, `500ms`), plain
 * seconds from now (`33011.38`), Unix times in seconds or milliseconds, and dates.
 */
export function parseReset(value: string, now: number): number | null {
  const text = value.trim();
  if (!text) return null;
  const number = Number(text);
  if (Number.isFinite(number)) {
    if (number < 0) return null;
    if (number >= 1e12) return number;
    return number >= 1e9 ? number * 1000 : now + number * 1000;
  }
  const match = DURATION.exec(text);
  if (match) {
    const [, h = '0', m = '0', s = '0', ms = '0'] = match;
    return now + Number(h) * 3_600_000 + Number(m) * 60_000 + Number(s) * 1000 + Number(ms);
  }
  const date = Date.parse(text);
  return Number.isNaN(date) ? null : date;
}

function windowName(suffix: string): { name: string; unit: RateUnit; period: number | null } {
  const unit: RateUnit = /tok/i.test(suffix) ? 'tokens' : 'requests';
  const period = Object.keys(PERIOD_MS).find((p) => suffix.toLowerCase().includes(p)) ?? null;
  return {
    name: period ? `${unit} per ${period}` : unit,
    unit,
    period: period ? (PERIOD_MS[period] ?? null) : null,
  };
}

/** The rate-limit windows in a response's headers. Empty when none can be read. */
export function readRateHeaders(headers: Headers, now: number): RateWindow[] {
  const found = new Map<string, { limit?: string; remaining?: string; reset?: string }>();
  headers.forEach((value, name) => {
    const match = RATE_HEADER.exec(name.toLowerCase());
    if (!match) return;
    const [, field, suffix = ''] = match;
    found.set(suffix, { ...found.get(suffix), [field as 'limit' | 'remaining' | 'reset']: value });
  });
  const windows: RateWindow[] = [];
  for (const [suffix, { limit, remaining, reset }] of found) {
    const total = Number(limit);
    const left = Number(remaining);
    if (limit === undefined || remaining === undefined || !(total > 0) || !Number.isFinite(left)) continue;
    const { name, unit, period } = windowName(suffix);
    const told = reset === undefined ? null : parseReset(reset, now);
    windows.push({
      name,
      unit,
      limit: total,
      remaining: Math.min(total, Math.max(0, left)),
      resetAt: told ?? (period === null ? null : now + period),
    });
  }
  return windows;
}
