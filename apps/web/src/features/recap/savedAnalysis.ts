import { z } from 'zod';

import { dbGet, dbUpdate } from '../../shared/storage/db.ts';
import type { WeakPoint } from '../../shared/storage/weakPoints.ts';
import type { AnalysisGroup } from './analysis.ts';
import type { RecapSelection } from './mistakes.ts';

/** `swv:recap:analysis`: the saved analysis of each selection. It never holds a key. */
export const SAVED_ANALYSIS_KEY = 'swv:recap:analysis';

/** The oldest analyses go first when more selections than this have one. */
const KEEP = 30;

const SavedAnalysisSchema = z.object({
  groups: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        points: z.array(z.string().min(1).max(600)).min(1).max(10),
        mistakeIds: z.array(z.string().max(64)).max(100),
      }),
    )
    .min(1)
    .max(10),
  /** Every mistake the analysis knew about: its id and the time of its latest miss. */
  seen: z.record(z.string(), z.string()),
  /** How many of them fitted in the request. */
  sent: z.number().int().min(0),
  /** The model that wrote it, to show on screen. */
  model: z.string().max(200),
  savedAt: z.iso.datetime(),
});

export type SavedAnalysis = z.infer<typeof SavedAnalysisSchema>;

/** The key of one selection. Flow ids start with `t:` or `p:`, so `*` cannot be one of them. */
export const selectionKey = ({ period, flowId }: RecapSelection): string =>
  `${period}|${flowId ?? '*'}`;

const isMap = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The saved analysis of a selection. Stored data is untrusted: anything invalid counts as none. */
export async function loadSavedAnalysis(key: string): Promise<SavedAnalysis | null> {
  const stored = await dbGet(SAVED_ANALYSIS_KEY);
  if (!isMap(stored)) return null;
  const parsed = SavedAnalysisSchema.safeParse(stored[key]);
  return parsed.success ? parsed.data : null;
}

const savedTime = (entry: unknown): string => {
  const parsed = SavedAnalysisSchema.safeParse(entry);
  return parsed.success ? parsed.data.savedAt : '';
};

export async function saveAnalysis(key: string, analysis: SavedAnalysis): Promise<void> {
  await dbUpdate(SAVED_ANALYSIS_KEY, (stored) => {
    const entries = Object.entries({ ...(isMap(stored) ? stored : {}), [key]: analysis });
    const newestFirst = entries.sort(([, a], [, b]) => savedTime(b).localeCompare(savedTime(a)));
    return Object.fromEntries(newestFirst.slice(0, KEEP));
  });
}

/** What is saved for an analysis of these mistakes, written now. */
export function newSavedAnalysis(
  groups: AnalysisGroup[],
  mistakes: readonly WeakPoint[],
  sent: number,
  model: string,
  now: Date,
): SavedAnalysis {
  const seen = Object.fromEntries(mistakes.map((mistake) => [mistake.id, mistake.date]));
  return { groups, seen, sent, model, savedAt: now.toISOString() };
}

/**
 * Saved until new mistakes appear: true unless a mistake is new or was missed again since. Mistakes
 * that went away, through correct answers or the end of a period, are not new.
 */
export const isCurrent = (saved: SavedAnalysis, mistakes: readonly WeakPoint[]): boolean =>
  mistakes.every((mistake) => saved.seen[mistake.id] === mistake.date);

/** The groups that still cover something. A group that names no mistakes always stays. */
export function liveGroups(
  groups: readonly AnalysisGroup[],
  mistakes: readonly WeakPoint[],
): AnalysisGroup[] {
  const ids = new Set(mistakes.map((mistake) => mistake.id));
  return groups.filter(
    (group) => group.mistakeIds.length === 0 || group.mistakeIds.some((id) => ids.has(id)),
  );
}
