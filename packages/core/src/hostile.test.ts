import { describe, expect, it } from 'vitest';

import { parseFlow } from './parse.ts';

const lines = (n: number, line: (i: number) => string): string =>
  Array.from({ length: n }, (_, i) => line(i)).join('\n');

/** Parses the code and returns the flow with the time it took. */
function timed(code: string) {
  const started = performance.now();
  const { flow } = parseFlow(code);
  return { flow, ms: performance.now() - started };
}

// Each of these used to take many seconds or fill the memory, from a diagram small enough to fit
// in a share link. The limit is far above what the parser needs now, so load cannot trip it.
const SLOW_MS = 5000;

describe('words from a diagram that name members of Object', () => {
  it('a layer kind cannot select a member of Object as its icon', () => {
    const code = `sequenceDiagram
      %% @layer A kind=__proto__ one
      %% @layer B kind=constructor two
      %% @layer C kind=toString three
      A->>B: go
      B->>C: go`;
    const { layers } = parseFlow(code).flow;
    for (const alias of ['A', 'B', 'C']) {
      expect(layers[alias]).toMatchObject({ kind: '', icon: '', zone: '' });
    }
  });

  it('a statement cannot open a block named after a member of Object', () => {
    const code = `sequenceDiagram
      __proto__ one
      constructor two
      toString three
      A->>B: go`;
    const { flow } = parseFlow(code);
    expect(flow.steps[0]?.branch).toEqual([]);
    expect(flow.syntax.map((s) => s.code)).toEqual([
      'unknown-line',
      'unknown-line',
      'unknown-line',
    ]);
  });

  it('participants with those names are ordinary participants', () => {
    const code = `sequenceDiagram
      %% @layer __proto__ kind=db stored
      %% @layer constructor kind=service builds
      __proto__->>constructor: one
      constructor-->>__proto__: two`;
    const { flow } = parseFlow(code);
    expect(flow.steps.map((s) => [s.from, s.to])).toEqual([
      ['__proto__', 'constructor'],
      ['constructor', '__proto__'],
    ]);
    expect(Object.keys(flow.layers)).toEqual(['__proto__', 'constructor']);
    expect(flow.layers.constructor).toMatchObject({ desc: 'builds', kind: 'service' });
    expect(flow.steps[1]?.answers).toBe(0);
  });

  it('an entity name cannot select a member of Object', () => {
    const { flow } = parseFlow('sequenceDiagram\nA->>B: #constructor; #valueOf;');
    expect(flow.steps[0]?.label).toEqual(['#constructor; #valueOf;']);
  });

  it('no diagram adds anything to Object.prototype', () => {
    parseFlow(`sequenceDiagram
      %% @layer __proto__ polluted=yes
      %% @term __proto__: polluted
      %% @uses __proto__ polluted text
      __proto__->>A: x`);
    expect(Object.keys(Object.prototype)).toEqual([]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('a small diagram cannot use up the browser', () => {
  it('deep nesting keeps a bounded number of blocks per arrow', () => {
    const depth = 20_000;
    const code = `sequenceDiagram\n${lines(depth, () => 'alt x')}\n${lines(depth, () => 'A->>B: y')}`;
    expect(code.length).toBeLessThan(400_000);
    const { flow, ms } = timed(code);
    expect(flow.steps).toHaveLength(depth);
    expect(flow.steps[depth - 1]?.branch.length).toBeLessThanOrEqual(32);
    expect(ms).toBeLessThan(SLOW_MS);
  });

  it('a block just inside the limit is still recorded', () => {
    const code = `sequenceDiagram\n${lines(32, (i) => `alt level ${i}`)}\nA->>B: y`;
    expect(parseFlow(code).flow.steps[0]?.branch.map((b) => b.label)[31]).toBe('level 31');
  });

  it('many unanswered replies stay fast', () => {
    const { flow, ms } = timed(`sequenceDiagram\n${lines(60_000, () => 'A-->>B: y')}`);
    expect(flow.steps.every((s) => s.answers === -1)).toBe(true);
    expect(ms).toBeLessThan(SLOW_MS);
  });

  it('a reply still pairs with the nearest earlier request', () => {
    const { flow } = parseFlow(`sequenceDiagram
      A->>B: first
      A->>B: second
      B-->>A: to second
      B-->>A: to second too`);
    expect(flow.steps.map((s) => s.answers)).toEqual([-1, -1, 1, 1]);
    expect(flow.steps[1]?.replies).toEqual([2, 3]);
  });

  it('many terms stay fast', () => {
    const { flow, ms } = timed(
      `sequenceDiagram\n${lines(60_000, (i) => `%% @term t${i}: x`)}\nA->>B: y`,
    );
    expect(flow.terms).toHaveLength(60_000);
    expect(ms).toBeLessThan(SLOW_MS);
  });

  it('a repeated term still replaces the earlier one', () => {
    const { flow } = parseFlow(`sequenceDiagram
      %% @term One: first
      %% @term two: kept
      %% @term ONE: last
      A->>B: y`);
    expect(flow.terms.map((t) => [t.term, t.def])).toEqual([
      ['ONE', 'last'],
      ['two', 'kept'],
    ]);
  });

  it('one side part used on every step stays fast', () => {
    const { flow, ms } = timed(
      `sequenceDiagram\n${lines(60_000, (i) => `%% @uses hook same text\nA->>B: y${i}`)}`,
    );
    expect(flow.uses[0]?.steps).toHaveLength(60_000);
    expect(ms).toBeLessThan(SLOW_MS);
  });

  it('a side part used twice on one step lists that step once', () => {
    const { flow } = parseFlow(`sequenceDiagram
      %% @uses hook same one
      %% @uses hook same two
      A->>B: y`);
    expect(flow.uses[0]?.steps).toEqual([0]);
  });

  it('labels that never match stay fast when the arrow counts differ', () => {
    // `->>B` counts as an arrow for the annotations but not for the drawing, and a # cuts the label.
    const code = `sequenceDiagram\n->>B: odd\n${lines(30_000, (i) => `A->>B: y${i}#cut`)}`;
    const { flow, ms } = timed(code);
    expect(flow.mismatch).toBe(true);
    expect(flow.steps).toHaveLength(30_000);
    expect(ms).toBeLessThan(SLOW_MS);
  });

  it('when the counts differ, arrows still pair with the next line of the same label', () => {
    const { flow } = parseFlow(`sequenceDiagram
      %% @step ignored line
      ->>B: odd
      %% @step first
      A->>B: same
      %% @step second
      A->>B: same
      %% @step third
      A->>B: other`);
    expect(flow.mismatch).toBe(true);
    expect(flow.steps.map((s) => s.explain)).toEqual(['first', 'second', 'third']);
  });
});
