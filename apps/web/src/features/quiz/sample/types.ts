import type { QuestionType } from '../types.ts';

/** One built-in question, written by hand against the demo flow. */
export interface SampleQuestion {
  /** The source step's `key`, which stays the same when steps are added around it. */
  step: string;
  type: QuestionType;
  topic: string;
  question: string;
  /** Four choices, only for multiple choice. */
  options?: string[];
  answer: string;
  why: string;
  /** Written answers are marked with these in the browser: every group needs one of its words. */
  keywords?: string[][];
}
