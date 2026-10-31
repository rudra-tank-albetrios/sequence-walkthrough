import type { Flow, Step } from '@swv/core';

import { pathVisible, type PathMode } from '../../shared/state/path.ts';

/** The status family of a reply, used as a CSS class: s2xx, s3xx, s4xx, s5xx or none. */
export type StatusFamily = 's2xx' | 's3xx' | 's4xx' | 's5xx' | 'none';

export function statusFamily(step: Step): StatusFamily {
  const code = step.status?.code ?? 0;
  if (code >= 500) return 's5xx';
  if (code >= 400) return 's4xx';
  if (code >= 300) return 's3xx';
  if (code >= 200) return 's2xx';
  return 'none';
}

/**
 * The next step the path filter and the chapter lock allow, walking from `cur` in `direction`.
 * -1 when there is none (or the lock stops at the chapter's edge).
 */
export function neighbour(
  flow: Flow,
  cur: number,
  direction: 1 | -1,
  path: PathMode,
  chapterLock: boolean,
): number {
  const current = flow.steps[cur];
  for (let i = cur + direction; i >= 0 && i < flow.steps.length; i += direction) {
    const step = flow.steps[i];
    if (!step || !pathVisible(step, path)) continue;
    if (chapterLock && current && step.section !== current.section) return -1;
    return i;
  }
  return -1;
}

/** `U → API` or `SVC ↻ itself`, with the aliases, for the small side cards. */
export const shortRoute = (step: Step): string =>
  step.kind === 'self' ? `${step.from} ↻ itself` : `${step.from} → ${step.to}`;

/** `2 hooks · 1 util`, for the "Also involved" and Behind summaries. */
export function usesSummary(uses: readonly { kind: string }[]): string {
  const byKind = new Map<string, number>();
  for (const u of uses) byKind.set(u.kind, (byKind.get(u.kind) ?? 0) + 1);
  return [...byKind.entries()].map(([kind, n]) => `${n} ${kind}${n === 1 ? '' : 's'}`).join(' · ');
}
