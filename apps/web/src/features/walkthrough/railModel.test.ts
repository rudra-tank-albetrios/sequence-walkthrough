import { parseFlow, type Section } from '@swv/core';
import { describe, expect, it } from 'vitest';

import {
  chapterAt,
  markerLines,
  railMarkers,
  railSections,
  railValueText,
  sharedSideSteps,
  stepAt,
  stepCentre,
} from './railModel.ts';

const section = (firstStep: number, count: number, idx: number): Section => ({
  name: `Chapter ${String(idx + 1)}`,
  firstStep,
  count,
  idx,
  hue: 210,
  line: -1,
  summary: '',
});

const CODE = `sequenceDiagram
  %% @title Rail flow
  participant A
  participant B
  %% @section First
  %% @uses cron nightly src/jobs/nightly.ts:4 Runs at night
  A->>B: POST /x
  %% @uses cron nightly src/jobs/nightly.ts:4 Runs at night
  B-->>A: 200 OK
  %% @section Second
  A->>B: GET /y
  B-->>A: 500 Failed
`;

describe('the rail model', () => {
  const flow = parseFlow(CODE).flow;

  it('turns a pointer position into the step under it, across the gaps between chapters', () => {
    const sections = [section(0, 2, 0), section(2, 2, 1)];
    // Two chapters, four steps, 400 pixels and a gap of 8: each step is 98 pixels wide.
    expect(stepAt(0, 400, sections, 4, 8)).toBe(0);
    expect(stepAt(97, 400, sections, 4, 8)).toBe(0);
    expect(stepAt(99, 400, sections, 4, 8)).toBe(1);
    expect(stepAt(199, 400, sections, 4, 8)).toBe(1);
    expect(stepAt(201, 400, sections, 4, 8)).toBe(2);
    expect(stepAt(399, 400, sections, 4, 8)).toBe(3);
    expect(stepAt(900, 400, sections, 4, 8)).toBe(3);
    expect(stepAt(-40, 400, sections, 4, 8)).toBe(0);
  });

  it('puts a step back at the same place it reads a pointer from', () => {
    const sections = [section(0, 3, 0), section(3, 5, 1), section(8, 1, 2)];
    for (let i = 0; i < 9; i++) {
      expect(stepAt(stepCentre(i, 600, sections, 9, 4), 600, sections, 9, 4)).toBe(i);
    }
  });

  it('survives a rail too narrow to measure', () => {
    expect(stepAt(10, 0, [section(0, 4, 0)], 4, 3)).toBe(0);
  });

  it('draws a flow without chapters as one chapter and skips empty ones', () => {
    const plain = parseFlow('sequenceDiagram\n  A->>B: one\n  B-->>A: two').flow;
    expect(railSections(plain)).toHaveLength(1);
    expect(railSections(plain)[0]?.count).toBe(2);
    expect(railSections(flow).map((s) => s.name)).toEqual(['First', 'Second']);
    expect(chapterAt(railSections(flow), -1)).toBe(0);
    expect(chapterAt(railSections(flow), 3)).toBe(1);
  });

  it('marks errors, side parts and bookmarks', () => {
    const sections = railSections(flow);
    const markers = railMarkers(flow, sections, (s) => s.idx === 2);
    expect(markers.filter((m) => m.kind === 'side').map((m) => m.index)).toEqual([0, 1]);
    expect(markers.filter((m) => m.kind === 'error').map((m) => m.index)).toEqual([3]);
    expect(markers.filter((m) => m.kind === 'star').map((m) => m.index)).toEqual([2]);
    expect(markers.find((m) => m.kind === 'error')?.chapter).toBe(1);
  });

  it('marks a threat, and moves a bookmark on the same step aside', () => {
    const threatened = parseFlow(CODE).flow;
    const step = threatened.steps[0];
    if (!step) throw new Error('no step');
    Object.assign(step, { threats: [{ level: 'high', text: 'Token in the URL' }] });
    const markers = railMarkers(threatened, railSections(threatened), (s) => s.idx === 0);
    expect(markers.find((m) => m.kind === 'threat')?.index).toBe(0);
    expect(markers.find((m) => m.kind === 'star')?.beside).toBe(true);
    expect(markerLines(step, true).map((l) => l.text)).toContain('Threat (high): Token in the URL');
  });

  it('finds the steps that share a side part', () => {
    expect([...sharedSideSteps(flow, flow.steps[0])].sort()).toEqual([0, 1]);
    expect(sharedSideSteps(flow, flow.steps[2]).size).toBe(0);
    expect(sharedSideSteps(flow, undefined).size).toBe(0);
  });

  it('says where the walk is in words', () => {
    const sections = railSections(flow);
    expect(railValueText(flow, sections, -1, false)).toBe('Overview, 4 steps');
    expect(railValueText(flow, sections, 0, true)).toContain('Step 1 of 4, First');
    expect(railValueText(flow, sections, 0, true)).toContain('cron nightly');
    expect(railValueText(flow, sections, 0, true)).toContain('Bookmarked');
    expect(railValueText(flow, sections, 3, false)).toContain('Error 500');
  });
});
