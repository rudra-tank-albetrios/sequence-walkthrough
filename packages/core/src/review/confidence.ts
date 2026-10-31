import type { Flow } from '../types.ts';
import { zoneOf, type Facts } from './facts.ts';
import type { ConfidenceReason, ReviewConfidence } from './types.ts';

const count = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Steps a code link is expected on: calls, and replies that reach the client. */
function linkable(facts: Facts): Flow['steps'] {
  return facts.flow.steps.filter((s) => s.kind !== 'reply' || zoneOf(facts, s.to) === 'client');
}

/**
 * How much evidence supports the rating. It rises with steps linked to code and with more flows
 * reviewed. It falls with unconfirmed details, and a diagram made without code stays low.
 */
export function confidenceOf(facts: Facts, flowsReviewed: number): ReviewConfidence {
  const { flow } = facts;
  const reasons: ConfidenceReason[] = [];
  let points = 0;
  const raise = (by: number, text: string) => {
    points += by;
    reasons.push({ effect: 'up', text });
  };
  const lower = (by: number, text: string) => {
    points -= by;
    reasons.push({ effect: 'down', text });
  };

  const expected = linkable(facts);
  const linked = expected.filter((s) => s.refs.length > 0).length;
  const share = expected.length > 0 ? linked / expected.length : 0;
  const madeWithoutCode = flow.proposed || linked === 0;
  if (flow.proposed) lower(0, 'This flow is a proposed design, not existing code.');
  else if (linked === 0)
    lower(0, 'No step links to code, so this may be drawn without reading it.');
  else if (share >= 0.7) raise(2, `${linked} of ${count(expected.length, 'call')} link to code.`);
  else if (share >= 0.3) raise(1, `${linked} of ${count(expected.length, 'call')} link to code.`);
  else lower(0, `Only ${linked} of ${count(expected.length, 'call')} link to code.`);

  const known = flow.participants.filter((p) => facts.kinds[p.alias]).length;
  if (flow.participants.length > 0 && known / flow.participants.length >= 0.7) {
    raise(1, `${known} of ${count(flow.participants.length, 'layer')} have a known kind.`);
  } else {
    lower(0, `Only ${known} of ${count(flow.participants.length, 'layer')} have a known kind.`);
  }

  if (flowsReviewed >= 5) raise(2, `${count(flowsReviewed, 'flow')} reviewed in this browser.`);
  else if (flowsReviewed >= 2)
    raise(1, `${count(flowsReviewed, 'flow')} reviewed in this browser.`);
  else lower(0, 'Only one flow reviewed so far. Reviewing more raises confidence.');

  if (flow.unconfirmed > 0) {
    const many = flow.unconfirmed / Math.max(1, flow.steps.length) > 0.15;
    lower(many ? 2 : 1, `${count(flow.unconfirmed, 'detail')} not confirmed from the code.`);
  }

  if (madeWithoutCode) return { level: 'low', reasons };
  const level = points >= 4 ? 'high' : points >= 2 ? 'medium' : 'low';
  return { level, reasons };
}
