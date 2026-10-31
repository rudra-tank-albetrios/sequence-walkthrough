import { parseFlow } from '@swv/core';
import { describe, expect, it } from 'vitest';

import { DEFAULT_DIAGRAM } from '../../shared/lib/defaultDiagram.ts';
import { flowId } from '../../shared/storage/notes.ts';
import { selectMistakes } from './mistakes.ts';
import { isDemoFlow, sampleRecap } from './sample.ts';

const { flow } = parseFlow(DEFAULT_DIAGRAM);
const now = new Date(2026, 9, 31, 15, 30);

describe('the built-in sample recap', () => {
  const { mistakes, groups } = sampleRecap(flow, now);

  it('recognises the demo flow, and only the unedited demo flow', () => {
    expect(isDemoFlow(DEFAULT_DIAGRAM)).toBe(true);
    expect(isDemoFlow(`\n${DEFAULT_DIAGRAM.replace(/\n/g, '\r\n')}\n`)).toBe(true);
    expect(isDemoFlow(DEFAULT_DIAGRAM.replace('Place an order', 'Place a booking'))).toBe(false);
    expect(isDemoFlow('sequenceDiagram\n  A->>B: hi')).toBe(false);
  });

  it('names real steps of the demo flow, in the chapters they belong to', () => {
    for (const mistake of mistakes) {
      const step = flow.steps.find((s) => s.n === mistake.step);
      expect(step, `step ${mistake.step}`).toBeDefined();
      expect(flow.sections[step?.section ?? -1]?.name, mistake.question).toBe(mistake.chapter);
    }
  });

  it('belongs to the demo flow, with a question, answers and a reason for every mistake', () => {
    for (const mistake of mistakes) {
      expect(mistake.flowId).toBe(flowId(flow));
      expect(mistake.flow).toBe('Place an order');
      for (const text of [
        mistake.question,
        mistake.userAnswer,
        mistake.whyWrong,
        mistake.correctAnswer,
        mistake.topic,
      ]) {
        expect(text.trim()).not.toBe('');
      }
    }
    expect(new Set(mistakes.map((m) => m.id)).size).toBe(mistakes.length);
  });

  it('has something in every period, more the longer the period', () => {
    const count = (period: 'today' | 'week' | 'all') =>
      selectMistakes(mistakes, { period, flowId: flowId(flow) }, now).length;
    expect(count('today')).toBe(2);
    expect(count('week')).toBe(4);
    expect(count('all')).toBe(5);
  });

  it('dates itself from the day it is opened', () => {
    const later = new Date(2027, 2, 1, 8);
    const today = selectMistakes(
      sampleRecap(flow, later).mistakes,
      { period: 'today', flowId: null },
      later,
    );
    expect(today).toHaveLength(2);
  });

  it('has groups that name only its own mistakes', () => {
    const ids = new Set(mistakes.map((m) => m.id));
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      expect(group.points.length).toBeGreaterThan(0);
      expect(group.mistakeIds.length).toBeGreaterThan(0);
      for (const id of group.mistakeIds) expect(ids.has(id), id).toBe(true);
    }
  });

  it('covers every mistake in at least one group', () => {
    const covered = new Set(groups.flatMap((group) => group.mistakeIds));
    for (const mistake of mistakes) expect(covered.has(mistake.id), mistake.id).toBe(true);
  });
});
