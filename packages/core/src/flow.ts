import { dataTouched, joinPayloads } from './data.ts';
import { normLabel, splitLabel } from './text.ts';
import type {
  Annotations,
  AnnotatedArrow,
  Boundary,
  Flow,
  FlowUses,
  Layer,
  Section,
  SequenceArrow,
  SequenceInfo,
  Step,
} from './types.ts';
import { CHAPTER_HUES, DEFAULT_TITLE, HTTP_RE, LAYER_KINDS, STATUS_RE, layerZone } from './vocabulary.ts';

/** Joins the annotation parse with Mermaid's view of the arrows into the Flow the UI uses. */
export function buildFlow(ann: Annotations, info: SequenceInfo | null): Flow {
  const isSequence = /^sequenceDiagram$/i.test(ann.diagramType) && info !== null;
  const sequence = isSequence ? info : null;
  const flow: Flow = {
    title: ann.title || ann.fmTitle || ann.kwTitle || DEFAULT_TITLE,
    hasTitle: Boolean(ann.title),
    spec: ann.spec,
    isSequence,
    diagramType: ann.diagramType || 'unknown',
    mode: ann.mode,
    proposed: ann.mode === 'proposed',
    scope: ann.scope,
    trigger: ann.trigger,
    summary: ann.summary.join('\n'),
    terms: ann.terms.slice(),
    layers: {},
    participants: [],
    sections: [],
    steps: [],
    lint: ann.lint.slice(),
    mismatch: false,
    uses: [],
    effects: [],
    data: [],
    endings: [],
    unconfirmed: 0,
    threats: [],
    boundaries: [],
    main: -1,
    syntax: info?.syntax ?? [],
  };
  if (sequence === null) return flow;

  flow.participants = sequence.participants;
  for (const p of sequence.participants) {
    const l = ann.layers[p.alias];
    const kind = l && l.kind in LAYER_KINDS ? l.kind : p.type === 'actor' ? 'person' : '';
    const layer: Layer = {
      name: p.name,
      desc: l?.text ?? '',
      kind,
      icon: LAYER_KINDS[kind] ?? '',
      zone: layerZone(kind),
    };
    flow.layers[p.alias] = layer;
  }
  for (const [alias, l] of Object.entries(ann.layers)) {
    if (!(alias in flow.layers)) {
      flow.lint.push({ line: l.line, msg: `@layer ${alias}: no participant has this alias`, code: 'unknown-alias' });
    }
  }
  flow.boundaries = trustBoundaries(flow);

  const pairs = pairArrows(sequence.arrows, ann.arrows, flow);
  const keyCount = new Map<string, number>();
  let sectionIdx = -1;
  pairs.forEach(([m, a], idx) => {
    if (a?.section !== null && a?.section !== undefined) {
      flow.sections.push({
        name: a.section,
        firstStep: idx,
        count: 0,
        line: a.sectionLine,
        summary: (ann.sectionSummaries[a.sectionLine] ?? []).join('\n'),
        hue: 0,
        idx: 0,
      });
      sectionIdx = flow.sections.length - 1;
    }
    const step = makeStep(idx, m, a, flow, sectionIdx, keyCount);
    flow.steps.push(step);
    flow.unconfirmed += step.unconfirmed.length;
    flow.threats.push(...step.threats.map((threat) => ({ ...threat, step: idx })));
    if (a && !a.step) {
      flow.lint.push({ line: a.line, msg: `Step ${step.n} (${step.fromName} → ${step.toName}) has no @step`, code: 'no-step', step: idx });
    }
    if (a && a.step.length > 240) {
      flow.lint.push({
        line: a.stepLine >= 0 ? a.stepLine : a.line,
        msg: `Step ${step.n}: @step is ${a.step.length} characters (keep it under 240)`,
        code: 'long-step',
        step: idx,
      });
    }
  });
  finishSections(flow);
  pairReplies(flow);

  const main = flow.steps.find((s) => s.http) ?? flow.steps.find((s) => s.kind === 'request');
  flow.main = main ? main.idx : -1;
  const first = sequence.participants[0]?.alias;
  flow.endings = main
    ? main.replies
    : flow.steps.filter((s) => s.kind === 'reply' && s.to === first).map((s) => s.idx);

  collectSideParts(flow);
  flow.data = dataTouched(flow.steps);

  if (!ann.title) {
    flow.lint.push({ line: Math.max(ann.typeLine, 0), msg: 'Add %% @title <flow name> so the flow has a name', code: 'no-title' });
  }
  if (flow.mismatch) {
    const matched = pairs.filter((p) => p[1]).length;
    flow.lint.push({ line: 0, msg: `Matched ${matched} of ${sequence.arrows.length} arrows to code lines`, code: 'mismatch' });
  }
  flow.lint.sort((a, b) => a.line - b.line);
  return flow;
}

/** Dotted lines between neighbouring participants whose zones differ (only when both have a kind). */
function trustBoundaries(flow: Flow): Boundary[] {
  const out: Boundary[] = [];
  const parts = flow.participants;
  for (let i = 1; i < parts.length; i++) {
    const left = parts[i - 1];
    const right = parts[i];
    if (!left || !right) continue;
    const a = flow.layers[left.alias];
    const b = flow.layers[right.alias];
    if (a?.zone && b?.zone && a.zone !== b.zone) {
      out.push({ left: left.alias, right: right.alias, from: a.zone, to: b.zone });
    }
  }
  return out;
}

type Pair = [SequenceArrow, AnnotatedArrow | null];

/** Mermaid's arrows next to the annotated lines: by position, or by label when the counts differ. */
function pairArrows(mArrows: SequenceArrow[], annArrows: AnnotatedArrow[], flow: Flow): Pair[] {
  if (mArrows.length === annArrows.length) return mArrows.map((m, i) => [m, annArrows[i] ?? null]);
  flow.mismatch = true;
  const pairs: Pair[] = [];
  let p = 0;
  for (const m of mArrows) {
    const want = normLabel(m.text);
    let hit: AnnotatedArrow | null = null;
    for (let j = p; j < annArrows.length; j++) {
      const candidate = annArrows[j];
      if (candidate && normLabel(candidate.text) === want) {
        hit = candidate;
        p = j + 1;
        break;
      }
    }
    pairs.push([m, hit]);
  }
  return pairs;
}

function makeStep(
  idx: number,
  m: SequenceArrow,
  a: AnnotatedArrow | null,
  flow: Flow,
  sectionIdx: number,
  keyCount: Map<string, number>,
): Step {
  const label = splitLabel(m.text);
  const baseKey = `${m.from}→${m.to}|${label.join(' / ')}`;
  const count = (keyCount.get(baseKey) ?? 0) + 1;
  keyCount.set(baseKey, count);
  const payloads = (a?.payloads ?? []).map((p) => ({ part: p.part, text: p.text }));
  const http = HTTP_RE.exec(label[0] ?? '');
  const status = STATUS_RE.exec(label[0] ?? '');
  const kind = m.from === m.to ? 'self' : m.dotted ? 'reply' : 'request';
  const statusCode = status?.[1] ? Number(status[1]) : null;
  return {
    idx,
    n: idx + 1,
    line: a ? a.line : -1,
    annLines: a ? a.annLines : [],
    from: m.from,
    to: m.to,
    fromName: flow.layers[m.from]?.name ?? m.from,
    toName: flow.layers[m.to]?.name ?? m.to,
    kind,
    labelRaw: m.text,
    label,
    explain: a ? a.step : '',
    payloads,
    payload: joinPayloads(payloads),
    refs: a ? a.refs : [],
    uses: a ? a.uses : [],
    effects: a ? a.effects : [],
    fields: a ? a.fields : [],
    schema: a ? a.schema : [],
    state: a ? a.state : { before: '', after: '' },
    flags: a ? a.flags : {},
    unconfirmed: a ? a.unconfirmed : [],
    threats: a ? a.threats : [],
    http: http?.[1] && http[2] ? { method: http[1], path: http[2] } : null,
    status: statusCode !== null ? { code: statusCode, reason: (status?.[2] ?? '').trim() } : null,
    section: sectionIdx,
    branch: m.branch,
    key: baseKey + (count > 1 ? `#${count}` : ''),
    replies: [],
    answers: -1,
    isError: kind === 'reply' && statusCode !== null && statusCode >= 400,
    inElse: m.branch.some((b) => b.kind === 'else'),
  };
}

/** Adds the implicit "Start" chapter, counts steps per chapter and gives each its colour. */
function finishSections(flow: Flow): void {
  const first = flow.sections[0];
  if (first && first.firstStep > 0) {
    const start: Section = { name: 'Start', firstStep: 0, count: 0, implicit: true, line: -1, summary: '', hue: 0, idx: 0 };
    flow.sections.unshift(start);
    for (const s of flow.steps) s.section += 1;
  }
  flow.sections.forEach((s, i) => {
    s.count = (flow.sections[i + 1]?.firstStep ?? flow.steps.length) - s.firstStep;
    s.hue = CHAPTER_HUES[i % CHAPTER_HUES.length] ?? 0;
    s.idx = i;
  });
  for (const s of flow.steps) {
    if (s.section < 0) s.section = flow.sections.length ? 0 : -1;
  }
}

/** A dashed B→A answers the nearest earlier solid A→B. */
function pairReplies(flow: Flow): void {
  for (const s of flow.steps) {
    if (s.kind !== 'reply') continue;
    for (let j = s.idx - 1; j >= 0; j--) {
      const r = flow.steps[j];
      if (r?.kind === 'request' && r.from === s.to && r.to === s.from) {
        s.answers = j;
        r.replies.push(s.idx);
        break;
      }
    }
  }
}

/** Side parts and effects for the whole flow. */
function collectSideParts(flow: Flow): void {
  const usesMap = new Map<string, FlowUses>();
  for (const s of flow.steps) {
    for (const u of s.uses) {
      const k = `${u.kind}|${u.name}`;
      const e = usesMap.get(k) ?? { kind: u.kind, name: u.name, ref: '', text: '', steps: [] };
      if (!e.ref && u.ref) e.ref = u.ref;
      if (u.text && (!e.text || u.text.length > e.text.length)) e.text = u.text;
      if (!e.steps.includes(s.idx)) e.steps.push(s.idx);
      usesMap.set(k, e);
    }
    for (const t of s.effects) flow.effects.push({ text: t, step: s.idx });
  }
  flow.uses = [...usesMap.values()].sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name),
  );
}
