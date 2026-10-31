import { isFollowable, tokens, type Step } from '@swv/core';

import type { GlossaryEntry } from '../../shared/state/glossaryStore.ts';

export const FIXED_CHIPS = ['Explain simpler', 'Why this step?', 'What if it fails?'] as const;

/** Technical-looking tokens: paths, headers, snake_case, CamelCase, ALLCAPS; never everyday words. */
const techy = (t: string): boolean =>
  /[A-Za-z]/.test(t) &&
  !/^\d+$/.test(t) &&
  !/^(GET|POST|PUT|PATCH|DELETE)$/.test(t) &&
  (/[_/\-.]|\d/.test(t) || /^[A-Z]{2,}$/.test(t) || /[a-z][A-Z]/.test(t));

/**
 * Up to six words worth a `What is …?` chip: glossary terms present in the step, then names from
 * the label, then technical tokens from the explanation (version 2's `Ask.mount`).
 */
export function suggestedWords(step: Step, terms: GlossaryEntry[]): string[] {
  const label = step.label.join(' ');
  const text = `${label} ${step.explain}`.toLowerCase();
  const fromTerms = terms
    .filter((t) => t.source === 'code' && text.includes(t.term.toLowerCase()))
    .map((t) => t.term);
  const pick = (source: string) => tokens(source).filter((t) => isFollowable(t) && techy(t));
  return [...new Set([...fromTerms, ...pick(label), ...pick(step.explain)])].slice(0, 6);
}

export function suggestedChips(step: Step, terms: GlossaryEntry[]): string[] {
  return [...FIXED_CHIPS, ...suggestedWords(step, terms).map((w) => `What is ${w}?`)];
}
