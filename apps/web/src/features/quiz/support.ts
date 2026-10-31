import type { Flow, Step } from '@swv/core';

/**
 * Whether the flow on screen backs up an answer. A model can write anything, so this is checked in
 * the browser against the text of the question's source step and the steps right around it.
 */

const STOP_WORDS = new Set(
  'a an and are as at be been but by can did do does for from had has have how if in into is it its no not of on or so than that the their them then there they this to up was we were what when where which who why will with would you your'.split(
    ' ',
  ),
);

const WORD = /[\p{L}\p{N}_]+/gu;

/** At least this share of an answer's words must appear in the evidence. */
const SUPPORT_RATIO = 0.6;

const stem = (word: string): string => (word.length > 3 ? word.replace(/(?:ing|ed|es|s|e)$/, '') : word);

const wordsOf = (text: string): string[] => text.toLowerCase().match(WORD) ?? [];

/** `placeOrder` and `order_items` as separate words. */
const splitNames = (text: string): string =>
  text.replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2').replace(/_/g, ' ');

export interface Evidence {
  /** Every word as written, for facts: numbers, code names, HTTP methods. */
  exact: Set<string>;
  /** Stems of the words and of the parts of code names, for ordinary words. */
  stems: Set<string>;
}

function stepText(step: Step): string[] {
  const flags = Object.values(step.flags).filter((flag): flag is string => typeof flag === 'string');
  return [
    step.fromName,
    step.toName,
    step.labelRaw,
    step.explain,
    step.payload,
    step.status ? `${step.status.code} ${step.status.reason}` : '',
    step.http ? `${step.http.method} ${step.http.path}` : '',
    ...step.branch.map((branch) => branch.label),
    ...step.effects,
    ...step.fields.map((field) => `${field.name} ${field.text}`),
    ...step.schema.map((rule) => `${rule.field} ${rule.text}`),
    step.state.before,
    step.state.after,
    ...flags,
    ...step.uses.map((use) => `${use.kind} ${use.name} ${use.text}`),
  ];
}

/** The steps a question about `step` may lean on: it, its neighbours, its request and its replies. */
function relatedSteps(flow: Flow, step: Step): Step[] {
  const indexes = [step.idx - 1, step.idx + 1, step.answers, ...step.replies];
  return indexes.flatMap((i) => {
    const related = flow.steps[i];
    return related ? [related] : [];
  });
}

export function stepEvidence(flow: Flow, step: Step): Evidence {
  const section = flow.sections[step.section];
  const texts = [
    flow.summary,
    section?.name ?? '',
    section?.summary ?? '',
    flow.layers[step.from]?.desc ?? '',
    flow.layers[step.to]?.desc ?? '',
    ...stepText(step),
    ...relatedSteps(flow, step).flatMap(stepText),
  ].join(' ');
  return {
    exact: new Set(wordsOf(texts)),
    stems: new Set(wordsOf(`${texts} ${splitNames(texts)}`).map(stem)),
  };
}

/** Numbers, HTTP methods and code names: facts that must be in the flow exactly as written. */
export function factsIn(text: string): string[] {
  const patterns = [
    /\p{N}+/gu,
    /\b(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g,
    /\b\p{Ll}+\p{Lu}[\p{L}\p{N}]*\b/gu,
    /\b\p{Lu}\p{Ll}+\p{Lu}[\p{L}\p{N}]*\b/gu,
    /\b[\p{L}\p{N}]+_[\p{L}\p{N}_]+\b/gu,
  ];
  return patterns.flatMap((pattern) => text.match(pattern) ?? []).map((fact) => fact.toLowerCase());
}

/** The facts in `text` that the evidence does not contain. */
export function unsupportedFacts(text: string, evidence: Evidence): string[] {
  return factsIn(text).filter((fact) => !evidence.exact.has(fact));
}

/** True when the facts in `answer` are all in the evidence and most of its words are too. */
export function isSupported(answer: string, evidence: Evidence): boolean {
  if (unsupportedFacts(answer, evidence).length > 0) return false;
  const words = wordsOf(answer).filter((word) => !STOP_WORDS.has(word));
  if (words.length === 0) return false;
  const found = words.filter((word) => evidence.stems.has(stem(word)));
  return found.length / words.length >= SUPPORT_RATIO;
}
