import { beforeEach, describe, expect, it } from 'vitest';

import { dbDelete, dbGet, dbUpdate } from '../../shared/storage/db.ts';
import type { WeakPoint } from '../../shared/storage/weakPoints.ts';
import {
  isCurrent,
  liveGroups,
  loadSavedAnalysis,
  newSavedAnalysis,
  SAVED_ANALYSIS_KEY,
  saveAnalysis,
  selectionKey,
} from './savedAnalysis.ts';

const point = (id: string, date: string, patch: Partial<WeakPoint> = {}): WeakPoint => ({
  id,
  flowId: 't:Orders',
  flow: 'Orders',
  step: 1,
  chapter: '',
  topic: 'Topic',
  question: `${id}?`,
  userAnswer: 'wrong',
  correctAnswer: 'right',
  whyWrong: '',
  date,
  timesMissed: 2,
  ...patch,
});

const A = point('a', '2026-10-30T10:00:00.000Z');
const B = point('b', '2026-10-31T10:00:00.000Z');
const NOW = new Date('2026-10-31T12:00:00.000Z');
const GROUPS = [{ title: 'Theme', points: ['A point'], mistakeIds: ['a'] }];

const analysisOf = (mistakes: WeakPoint[], now = NOW) =>
  newSavedAnalysis(GROUPS, mistakes, mistakes.length, 'Groq · llama', now);

const KEY = selectionKey({ period: 'today', flowId: 't:Orders' });

beforeEach(async () => {
  await dbDelete(SAVED_ANALYSIS_KEY);
});

describe('the saved analysis', () => {
  it('comes back as it was saved, for its own selection only', async () => {
    const saved = analysisOf([A, B]);
    await saveAnalysis(KEY, saved);
    expect(await loadSavedAnalysis(KEY)).toEqual(saved);
    expect(await loadSavedAnalysis(selectionKey({ period: 'week', flowId: 't:Orders' }))).toBeNull();
    expect(await loadSavedAnalysis(selectionKey({ period: 'today', flowId: null }))).toBeNull();
  });

  it('keeps each selection apart, with all flows under its own key', () => {
    const keys = [
      selectionKey({ period: 'today', flowId: 't:Orders' }),
      selectionKey({ period: 'week', flowId: 't:Orders' }),
      selectionKey({ period: 'today', flowId: 't:Other' }),
      selectionKey({ period: 'today', flowId: null }),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each([
    ['a value that is not a map', 'oops'],
    ['a list', [1, 2]],
    ['an entry of the wrong shape', { [KEY]: { groups: 'not a list' } }],
    ['an entry with no groups', { [KEY]: { ...analysisOf([A]), groups: [] } }],
    ['an entry with a bad date', { [KEY]: { ...analysisOf([A]), savedAt: 'yesterday' } }],
    [
      'a group whose text is not text',
      { [KEY]: { ...analysisOf([A]), groups: [{ title: 1, points: ['x'], mistakeIds: [] }] } },
    ],
  ])('ignores %s in storage', async (_name, stored) => {
    await dbUpdate(SAVED_ANALYSIS_KEY, () => stored);
    expect(await loadSavedAnalysis(KEY)).toBeNull();
  });

  it('a bad entry does not stop a good one from loading or saving', async () => {
    await dbUpdate(SAVED_ANALYSIS_KEY, () => ({ other: 'broken' }));
    const saved = analysisOf([A]);
    await saveAnalysis(KEY, saved);
    expect(await loadSavedAnalysis(KEY)).toEqual(saved);
  });

  it('keeps the 30 newest, so storage cannot grow without end', async () => {
    for (let i = 0; i < 35; i++) {
      await saveAnalysis(`key-${i}`, analysisOf([A], new Date(Date.UTC(2026, 9, 1, 0, i))));
    }
    const stored = (await dbGet(SAVED_ANALYSIS_KEY)) as Record<string, unknown>;
    expect(Object.keys(stored)).toHaveLength(30);
    expect(stored['key-34']).toBeDefined();
    expect(stored['key-4']).toBeUndefined();
    expect(stored['key-5']).toBeDefined();
  });

  it('holds only the analysis, the mistake ids and the model name', () => {
    const saved = analysisOf([A]);
    expect(Object.keys(saved).sort()).toEqual(['groups', 'model', 'savedAt', 'seen', 'sent']);
    expect(saved.seen).toEqual({ a: A.date });
  });
});

describe('saved until new mistakes appear', () => {
  const saved = analysisOf([A, B]);

  it('is current for the same mistakes', () => {
    expect(isCurrent(saved, [A, B])).toBe(true);
  });

  it('stays current when correct answers lower a count or remove a mistake', () => {
    expect(isCurrent(saved, [{ ...A, timesMissed: 1 }, B])).toBe(true);
    expect(isCurrent(saved, [B])).toBe(true);
  });

  it('stays current when a mistake leaves the period', () => {
    expect(isCurrent(saved, [B])).toBe(true);
  });

  it('is out of date when a new mistake appears', () => {
    expect(isCurrent(saved, [A, B, point('c', NOW.toISOString())])).toBe(false);
  });

  it('is out of date when a known question is missed again', () => {
    expect(isCurrent(saved, [{ ...A, date: NOW.toISOString(), timesMissed: 3 }, B])).toBe(false);
  });
});

describe('groups that still cover something', () => {
  const groups = [
    { title: 'Covers a', points: ['x'], mistakeIds: ['a'] },
    { title: 'Covers a and b', points: ['x'], mistakeIds: ['a', 'b'] },
    { title: 'Names none', points: ['x'], mistakeIds: [] },
  ];

  it('hides a group when all its mistakes are gone', () => {
    expect(liveGroups(groups, [B]).map((group) => group.title)).toEqual([
      'Covers a and b',
      'Names none',
    ]);
    expect(liveGroups(groups, [A, B])).toHaveLength(3);
  });
});
