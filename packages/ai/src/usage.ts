import { z } from 'zod';

import type { ModelEntry } from './models.ts';
import type { RateWindow } from './ratelimit.ts';
import { notifyAiChange, readJson, writeJson } from './storage.ts';

/** `swv:ai:usage`: what this browser knows about each model's usage, by model id. */
const USAGE_KEY = 'swv:ai:usage';
/** A reading with no reset time is not trusted for longer than this. */
const STALE_MS = 86_400_000;
/** How long to leave a model alone after a 429 that did not say when to come back. */
const COOL_DOWN_MS = 60_000;

const Window = z.object({
  name: z.string(),
  unit: z.enum(['requests', 'tokens', 'credits']),
  limit: z.number().positive(),
  remaining: z.number().min(0),
  resetAt: z.number().nullable(),
});

const Record = z.object({
  /** The local date the counts below belong to. */
  day: z.string().catch('').default(''),
  /** Requests sent from this browser that day. */
  requests: z.number().min(0).catch(0).default(0),
  /** Tokens reported or estimated for that day. */
  tokens: z.number().min(0).catch(0).default(0),
  /** The last exact reading, from rate-limit headers or a key endpoint. */
  windows: z.array(Window).catch([]).default([]),
  readAt: z.number().catch(0).default(0),
  /** No tries before this time, after a limit error. */
  blockedUntil: z.number().catch(0).default(0),
});

export type UsageRecord = z.infer<typeof Record>;

const EMPTY: UsageRecord = { day: '', requests: 0, tokens: 0, windows: [], readAt: 0, blockedUntil: 0 };

const localDay = (now: number): string => {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const nextMidnight = (now: number): number => {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
};

/** Everything this browser knows, by model id. Malformed entries read as empty. */
export function loadUsage(): Readonly<Partial<Record<string, UsageRecord>>> {
  const raw = readJson(USAGE_KEY);
  if (typeof raw !== 'object' || raw === null) return {};
  return Object.fromEntries(
    Object.entries(raw).map(([id, value]) => {
      const parsed = Record.safeParse(value);
      return [id, parsed.success ? parsed.data : EMPTY];
    }),
  );
}

function update(id: string, change: (record: UsageRecord) => UsageRecord): void {
  const all = loadUsage();
  writeJson(USAGE_KEY, { ...all, [id]: change(all[id] ?? EMPTY) });
  notifyAiChange();
}

/** Forgets a deleted model's usage. */
export function forgetUsage(id: string): void {
  const { [id]: _gone, ...rest } = loadUsage();
  writeJson(USAGE_KEY, rest);
  notifyAiChange();
}

export interface UsageReading {
  /** Tokens this request cost, when known. */
  tokens?: number;
  /** A fresh exact reading. Replaces the last one. */
  windows?: readonly RateWindow[];
  /** A limit error: leave the model alone until this time. Null means the usual cool-down. */
  limited?: { until: number | null };
  /** False when only a reading came in, with no request sent. Default true. */
  counts?: boolean;
}

/** Adds one request and whatever it taught about the limits. */
export function recordUsage(id: string, reading: UsageReading, now: number): void {
  update(id, (record) => {
    const sameDay = record.day === localDay(now);
    const next: UsageRecord = {
      ...record,
      day: localDay(now),
      requests: (sameDay ? record.requests : 0) + (reading.counts === false ? 0 : 1),
      tokens: (sameDay ? record.tokens : 0) + (reading.tokens ?? 0),
    };
    if (reading.windows?.length) {
      next.windows = [...reading.windows];
      next.readAt = now;
    }
    if (reading.limited) next.blockedUntil = reading.limited.until ?? now + COOL_DOWN_MS;
    return next;
  });
}

/** The exact reading as it stands now: stale ones ignored, passed windows full again. */
function currentWindows(record: UsageRecord, now: number): RateWindow[] {
  if (record.readAt + STALE_MS <= now && record.windows.every((w) => w.resetAt === null)) return [];
  return record.windows.map((w) =>
    w.resetAt !== null && w.resetAt <= now ? { ...w, remaining: w.limit, resetAt: null } : w,
  );
}

const usedShare = (w: Pick<RateWindow, 'limit' | 'remaining'>): number => (w.limit - w.remaining) / w.limit;

/** The limit closest to running out. */
const tightest = <T extends Pick<RateWindow, 'limit' | 'remaining'>>(windows: readonly T[]): T | null =>
  windows.reduce<T | null>((worst, w) => (!worst || usedShare(w) > usedShare(worst) ? w : worst), null);

/** Windows made from the limits the person typed in, measured against this browser's count. */
function estimatedWindows(entry: ModelEntry, record: UsageRecord, now: number): RateWindow[] {
  const sameDay = record.day === localDay(now);
  const requests = sameDay ? record.requests : 0;
  const tokens = sameDay ? record.tokens : 0;
  const resetAt = nextMidnight(now);
  const out: RateWindow[] = [];
  const { requestsPerDay, tokensPerDay } = entry.limits;
  if (requestsPerDay) {
    out.push({ name: 'requests per day', unit: 'requests', limit: requestsPerDay, remaining: Math.max(0, requestsPerDay - requests), resetAt });
  }
  if (tokensPerDay) {
    out.push({ name: 'tokens per day', unit: 'tokens', limit: tokensPerDay, remaining: Math.max(0, tokensPerDay - tokens), resetAt });
  }
  return out;
}

export type UsageSource = 'exact' | 'estimated' | 'count';
export type UsageLevel = 'green' | 'amber' | 'red' | 'none';

/** What one usage bar shows (plan section 8.2). */
export interface UsageView {
  source: UsageSource;
  /** `Exact`, `Estimated, this browser only` or `Count only`. */
  label: string;
  /** Null when there is nothing to measure against. */
  percentUsed: number | null;
  level: UsageLevel;
  /** Always shown as text: `12% used, 12,680 of 14,400 requests left`. */
  text: string;
  /** Shown on hover: each limit and its reset time. */
  detail: string;
  /** When the tightest limit, or a limit error, clears. */
  resetAt: number | null;
  requestsToday: number;
}

/** Green under 60% used, amber from 60% to 85%, red above 85%. */
export function usageLevel(percentUsed: number | null): UsageLevel {
  if (percentUsed === null) return 'none';
  if (percentUsed < 60) return 'green';
  return percentUsed <= 85 ? 'amber' : 'red';
}

const amount = (n: number): string => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

/** `17:32`, or `2 Nov, 17:32` when it is not today. */
export function formatReset(at: number, now: number): string {
  const when = new Date(at);
  const time = when.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (localDay(at) === localDay(now)) return time;
  return `${when.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${time}`;
}

const windowDetail = (w: RateWindow, now: number): string =>
  `Limit ${amount(w.limit)} ${w.name}. ${w.resetAt === null ? 'No reset time given.' : `Resets at ${formatReset(w.resetAt, now)}.`}`;

/**
 * `usageView(entry: ModelEntry, record: UsageRecord | undefined, now?: number): UsageView`
 *
 * One model's usage bar: exact when the provider reported it, estimated when the person typed in
 * limits, a plain count otherwise.
 */
export function usageView(entry: ModelEntry, record: UsageRecord | undefined, now = Date.now()): UsageView {
  const r = record ?? EMPTY;
  const requestsToday = r.day === localDay(now) ? r.requests : 0;
  const exact = currentWindows(r, now);
  const windows = exact.length ? exact : estimatedWindows(entry, r, now);
  const worst = tightest(windows);
  const blockedAt = r.blockedUntil > now ? r.blockedUntil : null;
  if (!worst) {
    const requests = `${amount(requestsToday)} ${requestsToday === 1 ? 'request' : 'requests'} today`;
    return {
      source: 'count',
      label: 'Count only',
      percentUsed: null,
      level: 'none',
      text: requests,
      detail: 'This provider reports no limits, and none is set here. Add limits in AI settings for an estimate.',
      resetAt: blockedAt,
      requestsToday,
    };
  }
  const percentUsed = usedShare(worst) * 100;
  return {
    source: exact.length ? 'exact' : 'estimated',
    label: exact.length ? 'Exact' : 'Estimated, this browser only',
    percentUsed,
    level: usageLevel(percentUsed),
    text: `${Math.round(percentUsed)}% used, ${amount(worst.remaining)} of ${amount(worst.limit)} ${worst.unit} left`,
    detail: windows.map((w) => windowDetail(w, now)).join(' '),
    resetAt: blockedAt ?? worst.resetAt,
    requestsToday,
  };
}

/** How a model stands for the next question. */
export type ModelStanding = { state: 'ok' } | { state: 'low'; resetAt: number | null } | { state: 'out'; resetAt: number | null };

/** `out` after a limit error or at zero, `low` at or under the switch level, `ok` otherwise. */
export function standing(entry: ModelEntry, record: UsageRecord | undefined, switchAt: number, now: number): ModelStanding {
  const view = usageView(entry, record, now);
  if ((record?.blockedUntil ?? 0) > now) return { state: 'out', resetAt: view.resetAt };
  if (view.percentUsed === null) return { state: 'ok' };
  const left = 100 - view.percentUsed;
  if (left <= 0) return { state: 'out', resetAt: view.resetAt };
  return left <= switchAt ? { state: 'low', resetAt: view.resetAt } : { state: 'ok' };
}
