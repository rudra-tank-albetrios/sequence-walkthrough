import { callModel, REPLY_TOKENS } from '@swv/ai';
import type { Flow } from '@swv/core';

import type { ConnectedFlow, FlowQuestions } from './connect.ts';
import { planSlots, takeSlot, type Slot } from './plan.ts';
import { quizPrompt, QUIZ_SYSTEM } from './prompt.ts';
import { LEVELS, DIFFICULTIES, type Difficulty, type Question, type QuizConfig } from './types.ts';
import {
  checkQuestion,
  normalizeText,
  QuestionReplySchema,
  QuestionsEnvelopeSchema,
  sameQuestion,
} from './validate.ts';

/** The first try and one retry for each batch (plan section 8.9). */
const MAX_ATTEMPTS = 2;

/**
 * Questions per request. A short reply fits within what a reasoning model has left after its
 * thinking, and within a free tier's size limit on one request; a longer quiz takes several.
 */
const BATCH = 5;

/** The plan's budget is for one batch; a request for fewer questions asks for less. */
const TOKENS_PER_QUESTION = REPLY_TOKENS.quiz / BATCH;

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
  /** This flow's share of the quiz's places, when other flows share the quiz. All of them otherwise. */
  slots?: readonly Slot[];
  signal?: AbortSignal;
}

interface Batch {
  open: Slot[];
  good: Question[];
  /** Every question that must not be asked again: the ones to avoid and the ones just accepted. */
  known: string[];
  /** The step and answer of each accepted question, so one fact is only tested once. */
  facts: Set<string>;
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
  if (batch.known.some((known) => sameQuestion(reply.question, known))) {
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
  const fact = `${checked.question.stepIndex}|${normalizeText(reply.answer)}`;
  if (batch.facts.has(fact)) {
    batch.problems.push(`"${reply.question.slice(0, 60)}" tests the same fact as another question`);
    return;
  }
  if (!takeSlot(batch.open, focused ? null : level, reply.type)) {
    batch.problems.push(`one ${level} "${reply.type}" question too many`);
    return;
  }
  batch.known.push(reply.question);
  batch.facts.add(fact);
  batch.good.push({ ...checked.question, id: `q${batch.good.length + 1}` });
}

/** The step numbers the good questions name, for the "prefer other steps" line. */
const stepsUsed = (flow: Flow, questions: readonly Question[]): number[] =>
  questions.flatMap((question) => {
    const step = flow.steps[question.stepIndex];
    return step ? [step.n] : [];
  });

/**
 * Asks the model for a quiz, five questions at a time. Every question is checked against the
 * flow; a bad one is rejected and only the missing ones are asked for again, once per batch. A
 * quiz that came back at least half full is kept; after that the error says why.
 */
export async function generateQuestions(args: GenerateArgs): Promise<Question[]> {
  const { flow, config, avoid, weak, slots, signal } = args;
  const batch: Batch = {
    open: slots ? [...slots] : planSlots(config),
    good: [],
    known: [...avoid],
    facts: new Set(),
    problems: [],
  };
  const wanted = batch.open.length;
  const requests = Math.ceil(batch.open.length / BATCH) * MAX_ATTEMPTS;

  for (let request = 0; request < requests && batch.open.length > 0; request++) {
    const asking = batch.open.slice(0, BATCH);
    const problems = batch.problems;
    batch.problems = [];
    const result = await callModel({
      system: QUIZ_SYSTEM,
      prompt: quizPrompt({
        flow,
        config,
        slots: asking,
        avoid: [...batch.good.map((question) => question.text), ...avoid],
        usedSteps: stepsUsed(flow, batch.good),
        weak,
        problems,
      }),
      maxTokens: asking.length * TOKENS_PER_QUESTION,
      schema: QuestionsEnvelopeSchema,
      ...(signal ? { signal } : {}),
    });
    if (!result.ok) {
      const { kind, message } = result.error;
      if (kind === 'no-model' || kind === 'consent-needed') throw new QuizError(message, true);
      // A failed request says why in its own words, and auto-switch has already tried the other models.
      if (kind !== 'bad-reply') throw new QuizError(message);
      batch.problems.push(
        message.includes('no answer text')
          ? 'the model sent no answer text, which usually means it spent its token limit on thinking'
          : 'the reply was not a JSON object with a list of questions',
      );
      continue;
    }
    for (const item of result.data.questions) {
      if (batch.open.length > 0) accept(item, flow, config, batch);
    }
    if (result.data.questions.length === 0) batch.problems.push('the reply had no questions');
  }

  if (batch.good.length * 2 < wanted) {
    const why = batch.problems.slice(0, 3).join('; ') || 'too few questions came back';
    throw new QuizError(
      `The model's reply could not be used, even after one retry, so no quiz was made: ${why}. Try again, or choose another model in AI settings.`,
    );
  }
  return batch.good;
}

export interface AcrossArgs {
  flow: Flow;
  connected: readonly ConnectedFlow[];
  config: QuizConfig;
  avoid: readonly string[];
  /** Topics the user keeps missing, for one flow. */
  weakOf: (id: string) => readonly string[];
  /** The flow on screen's own id, for `weakOf`. */
  id: string;
  signal?: AbortSignal;
}

export interface AcrossResult {
  parts: FlowQuestions[];
  /** Connected flows no usable question came back for. */
  skipped: string[];
}

/**
 * Writes one quiz over the flow on screen and its connected flows. Each flow gets its own requests
 * with its whole summary and its fair share of the places, so every flow is really asked about and
 * a question is always checked against the flow it names. No flow repeats another's questions.
 */
export async function generateAcross(args: AcrossArgs): Promise<AcrossResult> {
  const { flow, connected, config, avoid, weakOf, id, signal } = args;
  const all: ConnectedFlow[] = [{ id: '', flow }, ...connected];
  const slots = planSlots(config);
  const parts: FlowQuestions[] = [];
  const skipped: string[] = [];
  const asked: string[] = [];
  let failure: unknown = null;
  for (const [place, part] of all.entries()) {
    try {
      const questions = await generateQuestions({
        flow: part.flow,
        config,
        avoid: [...asked, ...avoid],
        weak: weakOf(part.id || id),
        slots: slots.filter((_, i) => i % all.length === place),
        ...(signal ? { signal } : {}),
      });
      asked.push(...questions.map((question) => question.text));
      parts.push({ id: part.id, flow: part.flow, questions });
    } catch (error) {
      const fatal = !(error instanceof QuizError) || error.needsSettings || signal?.aborted;
      if (fatal || all.length === 1) throw error;
      failure ??= error;
      skipped.push(part.flow.title);
    }
  }
  if (asked.length * 2 < config.count) throw failure;
  return { parts, skipped };
}
