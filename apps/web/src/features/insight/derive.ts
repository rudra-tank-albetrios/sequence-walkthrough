import type { Step } from '@swv/core';

import { isUrl } from '../../shared/lib/util.ts';
import type { ChipTone } from '../../shared/ui/Chip.tsx';

export const unique = <T>(items: T[]): T[] => [...new Set(items)];

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
