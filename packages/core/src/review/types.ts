import type { FlowThreat, ThreatLevel } from '../types.ts';

/** The six areas the structure rules look at (plan section 8.11). */
export type ReviewArea =
  'layers' | 'validation' | 'access' | 'replies' | 'reliability' | 'exposure';

export interface ReviewFinding {
  rule: string;
  area: ReviewArea;
  severity: ThreatLevel;
  message: string;
  /** 0-based indexes of the steps this finding is about. */
  steps: number[];
}

/** What a rule checks, as listed on screen. */
export interface ReviewRuleInfo {
  id: string;
  area: ReviewArea;
  title: string;
}

/** `skipped` means the flow has nothing this rule can check; `detail` says why. */
export interface ReviewRuleResult extends ReviewRuleInfo {
  status: 'passed' | 'found' | 'skipped';
  detail: string;
}

export type ConfidenceLevel = 'low' | 'medium' | 'high';

export interface ConfidenceReason {
  effect: 'up' | 'down';
  text: string;
}

export interface ReviewConfidence {
  level: ConfidenceLevel;
  reasons: ConfidenceReason[];
}

export interface FlowReview {
  /** 0 to 100: how well this flow follows its layers. The same flow always gets the same number. */
  score: number;
  confidence: ReviewConfidence;
  findings: ReviewFinding[];
  rules: ReviewRuleResult[];
  threats: FlowThreat[];
}
