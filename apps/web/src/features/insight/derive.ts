import type { Flow, Step } from '@swv/core';

import type { ChipTone } from '../../shared/ui/Chip.tsx';

/** Joins class names, dropping the falsy ones (CSS module lookups may be undefined). */
export const cx = (...parts: (string | false | null | undefined)[]): string =>
  parts.filter(Boolean).join(' ');

export const unique = <T>(items: T[]): T[] => [...new Set(items)];

/** The steps the Insight lists talk about: all of them, or only those touching the spotlit layer. */
export function visibleSteps(flow: Flow | null, spot: string | null): Step[] {
  if (!flow?.isSequence) return [];
  return spot === null ? flow.steps : flow.steps.filter((s) => s.from === spot || s.to === spot);
}

export interface Endpoint {
  key: string;
  method: string;
  path: string;
  steps: number[];
  replies: number[];
}

/** One entry per distinct `METHOD path` label, with the requests that carry it and their replies. */
export function endpointList(steps: Step[]): Endpoint[] {
  const visible = new Set(steps.map((s) => s.idx));
  const map = new Map<string, Endpoint>();
  for (const s of steps) {
    if (!s.http) continue;
    const key = `${s.http.method} ${s.http.path}`;
    const entry = map.get(key) ?? { key, method: s.http.method, path: s.http.path, steps: [], replies: [] };
    entry.steps.push(s.idx);
    entry.replies.push(...s.replies.filter((i) => visible.has(i)));
    map.set(key, entry);
  }
  return [...map.values()];
}

export const isUrl = (ref: string): boolean => /^https?:/.test(ref);

/** `src/a.ts:12-14` → `src/a.ts`. */
export const stripLine = (ref: string): string => ref.replace(/:\d+(-\d+)?$/, '');

/** Code paths the steps reference, each with the steps that mention it, sorted by path. */
export function filesByPath(steps: Step[]): [string, number[]][] {
  const files = new Map<string, number[]>();
  for (const s of steps) {
    for (const ref of s.refs) {
      if (isUrl(ref)) continue;
      const path = stripLine(ref);
      const list = files.get(path) ?? [];
      if (!list.includes(s.idx)) list.push(s.idx);
      files.set(path, list);
    }
  }
  return [...files.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function statusTone(code: number | undefined): ChipTone {
  if (code === undefined) return 'neutral';
  if (code >= 500) return 'error';
  if (code >= 400) return 'unconfirmed';
  if (code >= 300) return 'marker';
  return 'ok';
}

export const ZONE_LABEL: Record<string, string> = {
  client: 'client side',
  ours: 'our code',
  outside: 'outside service',
};
