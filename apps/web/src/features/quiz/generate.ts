import type { Flow } from '@swv/core';

import { callModel, REPLY_TOKENS } from './model.ts';
import { planSlots, takeSlot, type Slot } from './plan.ts';
import { quizPrompt, QUIZ_SYSTEM } from './prompt.ts';
import { LEVELS, DIFFICULTIES, type Difficulty, type Question, type QuizConfig } from './types.ts';
import {
  checkQuestion,
  normalizeText,
  QuestionReplySchema,
  QuestionsEnvelopeSchema,
} from './validate.ts';

/** The first try and one retry (plan section 8.9). */
const MAX_ATTEMPTS = 2;

/** The plan's budget is 1,200 reply tokens for 5 questions; longer quizzes get the same per question. */
const TOKENS_PER_QUESTION = REPLY_TOKENS.quiz / 5;

/** A plain sentence for the screen. `needsSettings` means opening AI settings is the way forward. */
export class QuizError extends Error {
  readonly needsSettings: boolean;

  constructor(message: string, needsSettings = false) {
    super(message);
    this.name = 'QuizError';
    this.needsSettings = needsSettings;
  }
}

const levelOfTopic = (topic: string): Difficulty | null =>
  DIFFICULTIES.find((level) => LEVELS[level].topics.includes(topic)) ?? null;

export interface GenerateArgs {
  flow: Flow;
  config: QuizConfig;
  /** Question texts not to ask again. */
  avoid: readonly string[];
  /** Topics the user keeps missing. */
  weak: readonly string[];
  signal?: AbortSignal;
}

interface Batch {
  open: Slot[];
  good: Question[];
  seen: Set<string>;
  problems: string[];
}

/** Takes one item of a reply: a question that fills an open place, or a reason it does not. */
function accept(item: unknown, flow: Flow, config: QuizConfig, batch: Batch): void {
  const parsed = QuestionReplySchema.safeParse(item);
  if (!parsed.success) {
    batch.problems.push('a question did not have the agreed fields');
    return;
  }
  const reply = parsed.data;
  const key = normalizeText(reply.question);
  if (batch.seen.has(key)) {
    batch.problems.push(`"${reply.question.slice(0, 60)}" repeats an earlier question`);
    return;
  }
  const focused = config.focus.length > 0;
  if (focused && !config.focus.includes(reply.topic)) {
    batch.problems.push(`the topic "${reply.topic}" was not asked for`);
    return;
  }
  const level =
    config.difficulty !== 'all' && !focused
      ? config.difficulty
      : (reply.level ?? levelOfTopic(reply.topic));
  if (!level) {
    batch.problems.push(`"${reply.question.slice(0, 60)}" has no level`);
    return;
  }
  const checked = checkQuestion(reply, flow, level);
  if (!checked.ok) {
    batch.problems.push(checked.reason);
    return;
  }
  if (!takeSlot(batch.open, focused ? null : level, reply.type)) {
    batch.problems.push(`one ${level} "${reply.type}" question too many`);
    return;
  }
  batch.seen.add(key);
  batch.good.push({ ...checked.question, id: `q${batch.good.length + 1}` });
}

/**
 * Asks the model for a quiz. Every question is checked against the flow; a bad one is rejected and
 * only the missing ones are asked for again, once. After that the error says why.
 */
export async function generateQuestions(args: GenerateArgs): Promise<Question[]> {
  const { flow, config, avoid, weak, signal } = args;
  const batch: Batch = {
    open: planSlots(config),
    good: [],
    seen: new Set(avoid.map(normalizeText)),
    problems: [],
  };

  for (let attempt = 0; attempt < MAX_ATTEMPTS && batch.open.length > 0; attempt++) {
    const problems = batch.problems;
    batch.problems = [];
    const result = await callModel({
      system: QUIZ_SYSTEM,
      prompt: quizPrompt({ flow, config, slots: batch.open, avoid, weak, problems }),
      maxTokens: batch.open.length * TOKENS_PER_QUESTION,
      schema: QuestionsEnvelopeSchema,
      ...(signal ? { signal } : {}),
    });
    if (!result.ok) {
      const { kind, message } = result.error;
      if (kind === 'aborted') throw new QuizError(message);
      if (kind === 'no-model' || kind === 'consent-needed') throw new QuizError(message, true);
      batch.problems.push(message);
      continue;
    }
    for (const item of result.data.questions) {
      if (batch.open.length > 0) accept(item, flow, config, batch);
    }
    if (result.data.questions.length === 0) batch.problems.push('the reply had no questions');
  }

  if (batch.open.length > 0) {
    const why = batch.problems.slice(0, 3).join('; ') || 'too few questions came back';
    throw new QuizError(
      `The model's reply could not be used, even after one retry, so no quiz was made: ${why}. Try again, or choose another model in AI settings.`,
    );
  }
  return batch.good;
}
