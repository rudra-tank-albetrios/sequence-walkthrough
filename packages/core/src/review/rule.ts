import type { Facts } from './facts.ts';
import type { ReviewFinding, ReviewRuleInfo } from './types.ts';

/** A finding as a rule reports it; the rule's id and area are added afterwards. */
export type RuleFinding = Omit<ReviewFinding, 'rule' | 'area'>;

/** One browser rule. `check` returns its findings, or a sentence saying why it cannot run. */
export interface Rule extends ReviewRuleInfo {
  check: (facts: Facts) => RuleFinding[] | string;
}
