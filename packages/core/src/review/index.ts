import type { Flow, ThreatLevel } from '../types.ts';
import { confidenceOf } from './confidence.ts';
import { factsOf } from './facts.ts';
import type { Rule } from './rule.ts';
import { EXPOSURE_RULES } from './rulesExposure.ts';
import { LAYER_RULES } from './rulesLayers.ts';
import { RELIABILITY_RULES, REPLY_RULES } from './rulesReplies.ts';
import { REQUEST_RULES } from './rulesRequests.ts';
import type {
  FlowReview,
  ReviewArea,
  ReviewFinding,
  ReviewRuleInfo,
  ReviewRuleResult,
} from './types.ts';

const RULES: readonly Rule[] = [
  ...LAYER_RULES,
  ...REQUEST_RULES,
  ...REPLY_RULES,
  ...RELIABILITY_RULES,
  ...EXPOSURE_RULES,
];

/** Every rule, in the order the review lists them. */
export const REVIEW_RULES: readonly ReviewRuleInfo[] = RULES.map(({ id, area, title }) => ({
  id,
  area,
  title,
}));

export const REVIEW_AREA_LABEL: Readonly<Record<ReviewArea, string>> = {
  layers: 'Layers',
  validation: 'Validation',
  access: 'Access',
  replies: 'Replies',
  reliability: 'Reliability',
  exposure: 'Data exposure',
};

/** Points a finding takes off the rating. */
const PENALTY: Readonly<Record<ThreatLevel, number>> = { high: 20, medium: 10, low: 5 };

/** A problem repeated on many steps counts at most twice, so one habit cannot sink the rating. */
function rulePenalty(findings: readonly ReviewFinding[]): number {
  const points = findings.map((finding) => PENALTY[finding.severity]);
  const sum = points.reduce((total, value) => total + value, 0);
  return Math.min(sum, 2 * Math.max(0, ...points));
}

/**
 * The structure review of one flow: browser rules only, no model and no tokens, and the same flow
 * always gets the same result. `flowsReviewed` counts the flows reviewed so far, this one included.
 */
export function reviewFlow(flow: Flow, flowsReviewed = 1): FlowReview {
  const facts = factsOf(flow);
  const findings: ReviewFinding[] = [];
  const rules: ReviewRuleResult[] = [];
  let score = 100;
  for (const rule of RULES) {
    const { id, area, title } = rule;
    const result = flow.isSequence ? rule.check(facts) : 'This is not a sequence diagram.';
    if (typeof result === 'string') {
      rules.push({ id, area, title, status: 'skipped', detail: result });
      continue;
    }
    const found = result.map((finding) => ({ ...finding, rule: id, area }));
    findings.push(...found);
    score -= rulePenalty(found);
    rules.push({ id, area, title, status: found.length > 0 ? 'found' : 'passed', detail: '' });
  }
  return {
    score: Math.max(0, score),
    confidence: confidenceOf(facts, flowsReviewed),
    findings,
    rules,
    threats: flow.threats,
  };
}
