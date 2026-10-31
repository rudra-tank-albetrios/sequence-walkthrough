// The version 3 parser must reproduce what version 2 produced for every fixture (plan 7.1).
// tools/golden records version 2's output; the differences below are deliberate, recorded fixes.
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseFlow } from './parse.ts';
import { decodeEntities } from './text.ts';
import type { Boundary, Flow, Layer, SequenceArrow, Step } from './types.ts';
import { LAYER_KINDS, layerZone } from './vocabulary.ts';

const fixturesDir = resolve(import.meta.dirname, '../fixtures');

interface Golden {
  fixture: string;
  annotations: { layers: Record<string, { kind: string }> };
  mermaid: { info: V2Info | null } | { error: string };
  flow: V2Flow;
}

interface V2Info {
  participants: { alias: string; name: string; type: string }[];
  arrows: Omit<SequenceArrow, 'line'>[];
}

type V2Step = Omit<Step, 'branch' | 'inElse'> & Partial<Pick<Step, 'branch' | 'inElse'>>;

interface V2Flow extends Omit<Flow, 'endings' | 'syntax' | 'steps' | 'main'> {
  endings: V2Step[];
  steps: V2Step[];
  main?: number;
}

/**
 * Recorded difference 1: Mermaid stores `#59;` as `ﬂ°°59¶ß` and `#quot;` as `ﬂ°quot¶ß`, and version 2
 * showed those placeholders in its cards. Version 3 reads the source text and decodes the entity.
 * Both sides are normalised to the decoded character so the rest of the structure can be compared.
 */
function decodeEverywhere<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, item: unknown) =>
      typeof item === 'string'
        ? decodeEntities(item.replace(/ﬂ°°(\d+)¶ß/g, '#$1;').replace(/ﬂ°([a-zA-Z]+)¶ß/g, '#$1;'))
        : item,
    ),
  ) as T;
}

/**
 * Recorded difference 5: version 2 on `main` knew ten layer kinds. The eight backend kinds the plan
 * names (app, router, validator, controller, serializer, repository, eventbus, cron) are recognised
 * now, which also adds the trust boundaries between them and the outside.
 */
function withAllLayerKinds(golden: Golden): { layers: Record<string, Layer>; boundaries: Boundary[] } {
  const layers: Record<string, Layer> = {};
  for (const [alias, layer] of Object.entries(golden.flow.layers)) {
    const kind = golden.annotations.layers[alias]?.kind ?? '';
    layers[alias] =
      layer.kind === '' && kind in LAYER_KINDS
        ? { ...layer, kind, icon: LAYER_KINDS[kind] ?? '', zone: layerZone(kind) }
        : layer;
  }
  const boundaries: Boundary[] = [];
  const parts = golden.flow.participants;
  for (let i = 1; i < parts.length; i++) {
    const left = parts[i - 1];
    const right = parts[i];
    const a = left && layers[left.alias];
    const b = right && layers[right.alias];
    if (left && right && a?.zone && b?.zone && a.zone !== b.zone) {
      boundaries.push({ left: left.alias, right: right.alias, from: a.zone, to: b.zone });
    }
  }
  return { layers, boundaries };
}

/** Recorded difference 7: `@threat` is new, so the "known tags" message names it too. */
const withThreatTag = (msg: string): string =>
  msg.replace(/@unconfirmed\)$/, '@unconfirmed, @threat)');

/** Version 2's flow brought to version 3's shape, with each deliberate difference named. */
function normaliseGolden(golden: Golden): Omit<Flow, 'syntax'> {
  const flow = golden.flow;
  const steps: Step[] = flow.steps.map(({ branch = [], inElse = false, ...rest }) => ({
    ...rest,
    branch,
    inElse,
  }));
  return {
    ...flow,
    ...withAllLayerKinds(golden),
    steps: steps.map((step) => ({
      ...step,
      fromName: flow.layers[step.from]?.name ?? step.fromName,
      toName: flow.layers[step.to]?.name ?? step.toName,
      threats: [],
    })),
    threats: [],
    lint: flow.lint.map((entry) => ({ ...entry, msg: withThreatTag(entry.msg) })),
    // Recorded difference 3: endings are step indexes, not copies of the step objects.
    endings: flow.endings.map((step) => step.idx),
    // Recorded difference 2: a side part used twice on one step lists that step once.
    uses: flow.uses.map((u) => ({ ...u, steps: [...new Set(u.steps)] })),
    // Recorded difference 6: `main` is always present; version 2 left it out of non-sequence flows.
    main: flow.main ?? -1,
  };
}

/**
 * Recorded difference 4: when Mermaid refused the code, version 2 fell back to a regex read with no
 * participant declarations, no blocks and no statement splitting at `;`. Version 3 reads everything
 * it can and reports the error, so only who talks to whom and the step text are compared there.
 */
function arrowBasics(steps: { from: string; to: string; explain: string }[]) {
  return steps.map(({ from, to, explain }) => ({ from, to, explain }));
}

const fixtures = readdirSync(fixturesDir).filter((name) => name.endsWith('.mmd'));

describe('golden files from the version 2 parser', () => {
  it.each(fixtures)('%s', (name) => {
    const code = readFileSync(resolve(fixturesDir, name), 'utf8');
    const golden = JSON.parse(
      readFileSync(resolve(fixturesDir, name.replace(/\.mmd$/, '.golden.json')), 'utf8'),
    ) as Golden;
    const { flow, info } = parseFlow(code);
    const { syntax, ...actual } = flow;

    // An empty or non-sequence input is Mermaid's error too, but not a syntax issue of a sequence.
    if ('error' in golden.mermaid && flow.isSequence) {
      expect(syntax.length, 'Mermaid refused this code, so the parser must report why').toBeGreaterThan(0);
      expect(decodeEverywhere(arrowBasics(flow.steps))).toEqual(
        decodeEverywhere(arrowBasics(golden.flow.steps)),
      );
      return;
    }

    expect(decodeEverywhere(actual)).toEqual(decodeEverywhere(normaliseGolden(golden)));
    expect(syntax).toEqual([]);
    if (!('info' in golden.mermaid)) return;
    const v2 = golden.mermaid.info;
    if (!v2 || !info) return;
    expect(info.participants).toEqual(v2.participants);
    const arrows = info.arrows.map(({ line: _line, ...arrow }) => arrow);
    expect(decodeEverywhere(arrows)).toEqual(decodeEverywhere(v2.arrows));
  });
});
