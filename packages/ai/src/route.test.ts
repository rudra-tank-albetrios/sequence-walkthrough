import { beforeEach, describe, expect, it } from 'vitest';

import { newModel, type ModelEntry, type ModelState } from './models.ts';
import { planRoute } from './route.ts';
import { resetAiStorage } from './testing.ts';
import { loadUsage, recordUsage } from './usage.ts';

const NOW = new Date(2026, 9, 31, 12).getTime();

const model = (name: string, patch: Partial<ModelEntry> = {}): ModelEntry => ({
  ...newModel('groq'),
  id: name,
  name,
  key: `key-${name}`,
  ...patch,
});

const stateOf = (models: ModelEntry[], activeId = models[0]?.id ?? ''): ModelState => ({
  models,
  activeId,
  switchAt: 5,
  forgetKeys: false,
});

const names = (models: readonly ModelEntry[]) => models.map((m) => m.name);

const setRemaining = (id: string, remaining: number, resetAt: number | null = NOW + 60_000) => {
  recordUsage(id, { windows: [{ name: 'requests', unit: 'requests', limit: 100, remaining, resetAt }] }, NOW);
};

beforeEach(resetAiStorage);

describe('planRoute', () => {
  it('starts with the active model, then the marked fallbacks in list order', () => {
    const state = stateOf(
      [
        model('A', { fallback: true }),
        model('B'),
        model('C', { fallback: true }),
        model('D', { fallback: true }),
      ],
      'C',
    );
    const route = planRoute(state, {}, NOW);
    expect(names(route.attempts)).toEqual(['C', 'A', 'D']);
    expect(names(route.candidates)).toEqual(['C', 'A', 'D']);
  });

  it('lists every model at most once', () => {
    const state = stateOf([model('A', { fallback: true }), model('B', { fallback: true })]);
    const { attempts } = planRoute(state, {}, NOW);
    expect(new Set(names(attempts)).size).toBe(attempts.length);
  });

  it('never uses an unmarked model that is not active', () => {
    const route = planRoute(stateOf([model('A'), model('B')]), {}, NOW);
    expect(names(route.attempts)).toEqual(['A']);
  });

  it('puts a low model behind the healthy ones', () => {
    setRemaining('A', 5);
    const route = planRoute(stateOf([model('A'), model('B', { fallback: true })]), loadUsage(), NOW);
    expect(names(route.attempts)).toEqual(['B', 'A']);
    expect(route.skipped.map((s) => [s.model.name, s.reason])).toEqual([['A', 'low']]);
  });

  it('does not report a low model as passed over when nothing is better', () => {
    setRemaining('A', 5);
    setRemaining('B', 2);
    const route = planRoute(stateOf([model('A'), model('B', { fallback: true })]), loadUsage(), NOW);
    expect(names(route.attempts)).toEqual(['A', 'B']);
    expect(route.skipped).toEqual([]);
  });

  it('leaves out a used-up model until its reset', () => {
    setRemaining('A', 0, NOW + 60_000);
    const state = stateOf([model('A'), model('B', { fallback: true })]);
    const during = planRoute(state, loadUsage(), NOW);
    expect(names(during.attempts)).toEqual(['B']);
    expect(during.skipped.map((s) => [s.model.name, s.reason])).toEqual([['A', 'out']]);
    const after = planRoute(state, loadUsage(), NOW + 60_001);
    expect(names(after.attempts)).toEqual(['A', 'B']);
  });

  it('gives the earliest reset when everything is used up', () => {
    setRemaining('A', 0, NOW + 90_000);
    recordUsage('B', { limited: { until: NOW + 30_000 } }, NOW);
    const route = planRoute(stateOf([model('A'), model('B', { fallback: true })]), loadUsage(), NOW);
    expect(route.attempts).toEqual([]);
    expect(names(route.candidates)).toEqual(['A', 'B']);
    expect(route.earliestReset).toBe(NOW + 30_000);
  });

  it('passes over a model that is not set up, and reports the active one', () => {
    const state = stateOf([model('A', { key: '' }), model('B', { fallback: true }), model('C', { fallback: true, key: '' })]);
    const route = planRoute(state, {}, NOW);
    expect(names(route.attempts)).toEqual(['B']);
    expect(route.skipped.map((s) => [s.model.name, s.reason])).toEqual([['A', 'not-ready']]);
  });

  it('has nothing to offer with an empty list', () => {
    expect(planRoute(stateOf([]), {}, NOW)).toEqual({ candidates: [], attempts: [], skipped: [], earliestReset: null });
  });
});
