/** The AI token budgets of plan section 5, in one place. Unit tests fail when one is broken. */

/** Reply budgets, sent as `max_tokens`. */
export const REPLY_TOKENS = {
  /** One Ask AI answer. */
  ask: 220,
  /** A quiz of 5 questions. */
  quiz: 1200,
  /** Marking one-line answers, in one batch per quiz. */
  mark: 80,
  /** The day recap. */
  recap: 500,
} as const;

/** The most a flow summary or step summary may cost in a prompt. */
export const FLOW_SUMMARY_TOKENS = 1500;

/**
 * The most one request may send: a flow summary plus the question or instructions. `callModel`
 * refuses anything larger with the typed error `prompt-too-large`, so a pasted wall of text cannot
 * eat a free tier.
 */
export const MAX_PROMPT_TOKENS = 3000;

const encoder = new TextEncoder();

/** About one token per four bytes of UTF-8: close for English, and safe for other scripts. */
export const estimateTokens = (text: string): number => Math.ceil(encoder.encode(text).length / 4);

/** Cuts text to a token budget, ending with `…` when something was removed. */
export function clampTokens(text: string, maxTokens: number): string {
  if (estimateTokens(text) <= maxTokens) return text;
  let end = Math.floor((text.length * maxTokens) / estimateTokens(text));
  while (end > 0 && estimateTokens(text.slice(0, end)) + 1 > maxTokens) end = Math.floor(end * 0.95);
  return `${text.slice(0, end).trimEnd()}…`;
}
