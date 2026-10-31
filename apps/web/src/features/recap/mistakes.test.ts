import { describe, expect, it } from 'vitest';

import type { WeakPoint } from '../../shared/storage/weakPoints.ts';
import { selectMistakes } from './mistakes.ts';

const now = new Date(2026, 9, 31, 15, 30);

const point = (id: string, date: Date, patch: Partial<WeakPoint> = {}): WeakPoint => ({
  id,
  flowId: 't:Orders',
  flow: 'Orders',
  step: 1,
  chapter: 'One',
  topic: 'Topic',
  question: `Question ${id}?`,
  userAnswer: 'wrong',
  correctAnswer: 'right',
  whyWrong: 'because',
  date: date.toISOString(),
  timesMissed: 1,
  ...patch,
});

const ids = (points: readonly WeakPoint[]) => points.map((p) => p.id);

describe('selecting mistakes', () => {
  const points = [
    point('start-of-today', new Date(2026, 9, 31)),
    point('last-night', new Date(2026, 9, 30, 23, 59, 59, 999)),
    point('start-of-week', new Date(2026, 9, 25)),
    point('before-the-week', new Date(2026, 9, 24, 23, 59, 59, 999)),
    point('other-flow-today', new Date(2026, 9, 31, 9), { flowId: 't:Other', flow: 'Other' }),
  ];

  it('today holds only what was missed since local midnight', () => {
    expect(ids(selectMistakes(points, { period: 'today', flowId: 't:Orders' }, now))).toEqual([
      'start-of-today',
    ]);
  });

  it('last 7 days stops at midnight six days back', () => {
    expect(ids(selectMistakes(points, { period: 'week', flowId: 't:Orders' }, now))).toEqual([
      'start-of-today',
      'last-night',
      'start-of-week',
    ]);
  });

  it('all time holds everything for the flow', () => {
    expect(selectMistakes(points, { period: 'all', flowId: 't:Orders' }, now)).toHaveLength(4);
  });

  it('a null flow id means all flows', () => {
    expect(ids(selectMistakes(points, { period: 'today', flowId: null }, now))).toEqual([
      'other-flow-today',
      'start-of-today',
    ]);
    expect(selectMistakes(points, { period: 'all', flowId: null }, now)).toHaveLength(5);
  });

  it('counts a mistake on the day it was last missed', () => {
    const missedAgain = point('old-but-missed-today', new Date(2026, 9, 31, 8), { timesMissed: 3 });
    expect(ids(selectMistakes([missedAgain], { period: 'today', flowId: null }, now))).toEqual([
      'old-but-missed-today',
    ]);
  });

  it('lists the most missed first, then the latest', () => {
    const list = [
      point('once-old', new Date(2026, 9, 1)),
      point('twice', new Date(2026, 9, 2), { timesMissed: 2 }),
      point('once-new', new Date(2026, 9, 3)),
    ];
    expect(ids(selectMistakes(list, { period: 'all', flowId: null }, now))).toEqual([
      'twice',
      'once-new',
      'once-old',
    ]);
  });
});
