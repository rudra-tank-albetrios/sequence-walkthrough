import { isFollowable, tokens, type Flow, type Step } from '@swv/core';

/** Everything Find looks through for one step. */
export function stepSearchText(flow: Flow, step: Step): string {
  const section = flow.sections[step.section];
  return [
    step.label.join(' '),
    step.explain,
    step.payload,
    step.fromName,
    step.toName,
    section?.name ?? '',
    step.uses.map((u) => `${u.name} ${u.text}`).join(' '),
    step.effects.join(' '),
  ]
    .join(' \n ')
    .toLowerCase();
}

/** Step indexes whose text contains the query (case-insensitive). Empty query matches nothing. */
export function findHits(flow: Flow | null, query: string): number[] {
  const q = query.trim().toLowerCase();
  if (!flow?.isSequence || !q) return [];
  return flow.steps.filter((s) => stepSearchText(flow, s).includes(q)).map((s) => s.idx);
}

const tokenCache = new WeakMap<Step, Set<string>>();

/** The lower-cased tokens of a step's label, payload and explanation, cached per step object. */
export function stepTokens(step: Step): Set<string> {
  let set = tokenCache.get(step);
  if (!set) {
    set = new Set(tokens([step.label.join(' '), step.payload, step.explain].join(' \n ')).map((t) => t.toLowerCase()));
    tokenCache.set(step, set);
  }
  return set;
}

/** Steps that mention a followed value. Null when the token is too short or too common. */
export function followHits(flow: Flow | null, token: string): number[] | null {
  if (!isFollowable(token)) return null;
  const want = token.toLowerCase();
  return (flow?.steps ?? []).filter((s) => stepTokens(s).has(want)).map((s) => s.idx);
}

export { isFollowable, tokens };
