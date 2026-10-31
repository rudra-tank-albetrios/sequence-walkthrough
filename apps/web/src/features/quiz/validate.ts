import type { Flow } from '@swv/core';
import { z } from 'zod';

import { isSupported, stepEvidence, unsupportedFacts } from './support.ts';
import { QUESTION_TYPES, type Difficulty, type Question } from './types.ts';

/**
 * A question as a model (or the built-in sample) writes it. Model replies are untrusted: the shape
 * is checked here, the content against the flow in `checkQuestion`, and the text is only ever shown
 * as plain text.
 */
export const QuestionReplySchema = z.object({
  type: z.enum(QUESTION_TYPES),
  /** The step number shown on screen, from 1. */
  step: z.number().int(),
  level: z.enum(['easy', 'medium', 'hard']).optional(),
  topic: z.string().trim().min(1).max(60),
  question: z.string().trim().min(8).max(400),
  options: z.array(z.string().trim().min(1).max(200)).optional(),
  answer: z.string().trim().min(1).max(500),
  why: z.string().trim().min(1).max(500),
});

export type QuestionReply = z.infer<typeof QuestionReplySchema>;

/** The whole reply. Questions are checked one by one, so one bad question does not lose the rest. */
export const QuestionsEnvelopeSchema = z.object({ questions: z.array(z.unknown()).max(40) });

export const normalizeText = (text: string): string =>
  text.trim().toLowerCase().replace(/\s+/g, ' ');

export type Checked = { ok: true; question: Question } | { ok: false; reason: string };

const reject = (reason: string): Checked => ({ ok: false, reason });

function optionProblem(reply: QuestionReply): string | null {
  const options = reply.options ?? [];
  if (options.length !== 4) return 'a multiple choice question needs exactly four options';
  if (new Set(options.map(normalizeText)).size !== 4) return 'two options are the same';
  if (!options.some((option) => normalizeText(option) === normalizeText(reply.answer))) {
    return 'the answer is not one of the options';
  }
  return null;
}

/**
 * Accepts a question only if it names a step of this flow and that step backs up its answer. A
 * rejected question never reaches the screen.
 */
export function checkQuestion(reply: QuestionReply, flow: Flow, difficulty: Difficulty): Checked {
  const step = flow.steps[reply.step - 1];
  if (!step) return reject(`step ${reply.step} does not exist in this flow`);
  if (reply.type === 'choice') {
    const problem = optionProblem(reply);
    if (problem) return reject(`step ${reply.step}: ${problem}`);
  }
  const evidence = stepEvidence(flow, step);
  if (!isSupported(reply.answer, evidence)) {
    return reject(`step ${reply.step} does not support the answer "${reply.answer.slice(0, 80)}"`);
  }
  const unbacked = unsupportedFacts(reply.why, evidence);
  if (unbacked.length > 0) {
    return reject(`step ${reply.step} does not support "${unbacked.join(', ').slice(0, 80)}"`);
  }
  return {
    ok: true,
    question: {
      id: '',
      type: reply.type,
      difficulty,
      stepIndex: step.idx,
      topic: reply.topic,
      text: reply.question,
      options: reply.type === 'choice' ? (reply.options ?? []) : [],
      answer: reply.answer,
      why: reply.why,
    },
  };
}
