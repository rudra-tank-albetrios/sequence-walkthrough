import { expect, type Locator, type Page, type Route } from '@playwright/test';
import { parseFlow } from '@swv/core';

import { planSlots } from '../../apps/web/src/features/quiz/plan.ts';
import { EASY } from '../../apps/web/src/features/quiz/sample/easy.ts';
import { HARD } from '../../apps/web/src/features/quiz/sample/hard.ts';
import { MEDIUM } from '../../apps/web/src/features/quiz/sample/medium.ts';
import type { SampleQuestion } from '../../apps/web/src/features/quiz/sample/types.ts';
import type {
  Difficulty,
  DifficultyChoice,
  TypeChoice,
} from '../../apps/web/src/features/quiz/types.ts';
import { demoFlow, open } from '../helpers.ts';

/**
 * What the quiz specs share: a mocked model that answers with the built-in sample's questions
 * (the unit tests prove every one names a real step of the demo flow and is backed by it), the
 * set-up screen's controls, and the quiz's lists. No real provider is ever reached.
 */

export const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
export const GROQ_HOST = 'api.groq.com';
export const E2E_KEY = 'gsk_e2e_quiz';

/** Ask AI's settings with a Groq key, as the page stores them. */
export const aiSettings = (): string =>
  JSON.stringify({
    provider: 'groq',
    keys: { groq: E2E_KEY },
    models: {},
    customUrl: '',
    includePayload: true,
    autoNote: true,
    mode: 'project',
  });

/** Opens the viewer on the demo flow with a model set up. */
export const openWithModel = (page: Page) =>
  open(page, {
    storage: { 'swv:ai': aiSettings(), 'swv:ai:consent': JSON.stringify([GROQ_HOST]) },
  });

export const flow = parseFlow(demoFlow()).flow;

const SAMPLES: Record<Difficulty, readonly SampleQuestion[]> = { easy: EASY, medium: MEDIUM, hard: HARD };

export const ALL_SAMPLES: readonly SampleQuestion[] = [...EASY, ...MEDIUM, ...HARD];

/** The sample question with this text. */
export function sampleFor(text: string): SampleQuestion {
  const found = ALL_SAMPLES.find((sample) => sample.question === text.trim());
  if (!found) throw new Error(`No sample question reads "${text}"`);
  return found;
}

/** The step number shown on screen for a sample question's step key. */
export function stepNumber(sample: SampleQuestion): number {
  const step = flow.steps.find((candidate) => candidate.key === sample.step);
  if (!step) throw new Error(`The demo flow has no step ${sample.step}`);
  return step.n;
}

/** One question as a model would reply with it. */
export interface ReplyItem {
  type: string;
  step: number;
  level: string;
  topic: string;
  question: string;
  options?: readonly string[];
  answer: string;
  why: string;
}

export function replyItem(sample: SampleQuestion, level: Difficulty): ReplyItem {
  return {
    type: sample.type,
    step: stepNumber(sample),
    level,
    topic: sample.topic,
    question: sample.question,
    ...(sample.options ? { options: sample.options } : {}),
    answer: sample.answer,
    why: sample.why,
  };
}

export interface QuizShape {
  difficulty: DifficultyChoice;
  type: TypeChoice;
  count: 5 | 10 | 15;
}

/** Good questions for every place of a quiz of this shape, in the order the page plans them. */
export function goodItems(shape: QuizShape, skip = 0): ReplyItem[] {
  const used = new Map<string, number>();
  return planSlots(shape).map(({ difficulty, type }) => {
    const key = `${difficulty}:${type}`;
    const index = used.get(key) ?? skip;
    used.set(key, index + 1);
    const sample = SAMPLES[difficulty].filter((candidate) => candidate.type === type)[index];
    if (!sample) throw new Error(`The sample has no question ${index} for ${key}`);
    return replyItem(sample, difficulty);
  });
}

export const quizReply = (items: readonly unknown[]): string => JSON.stringify({ questions: items });

/** A mark for every written answer, in order. */
export const marksReply = (count: number, mark: 'correct' | 'partly' | 'wrong', why = 'Half of it.'): string =>
  JSON.stringify({ marks: Array.from({ length: count }, (_, i) => ({ id: i + 1, mark, why })) });

/** What the page sent to the model in one request. */
export interface SentRequest {
  authorization: string;
  model: string;
  maxTokens: number;
  system: string;
  user: string;
  /** `quiz` writes questions, `mark` marks written answers. */
  kind: 'quiz' | 'mark';
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export interface ModelMock {
  sent: SentRequest[];
  quizzes: () => SentRequest[];
  markings: () => SentRequest[];
}

interface MockReplies {
  /** The text of the n-th quiz reply (from 0). The last one repeats. */
  quiz: readonly string[];
  /** The text of every marking reply. */
  mark?: string;
  /** An HTTP status instead of an answer, for every call. */
  status?: number;
}

/** Answers the mocked provider and records every request. */
export async function mockModel(page: Page, replies: MockReplies): Promise<ModelMock> {
  const sent: SentRequest[] = [];
  let quizzes = 0;
  await page.route(GROQ_URL, async (route: Route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    const body = JSON.parse(request.postData() ?? '{}') as {
      model?: string;
      max_tokens?: number;
      messages?: { role: string; content: string }[];
    };
    const system = body.messages?.find((m) => m.role === 'system')?.content ?? '';
    const user = body.messages?.find((m) => m.role === 'user')?.content ?? '';
    const kind = system.startsWith('You mark') ? 'mark' : 'quiz';
    sent.push({
      authorization: request.headers().authorization ?? '',
      model: body.model ?? '',
      maxTokens: body.max_tokens ?? 0,
      system,
      user,
      kind,
    });
    if (replies.status) {
      await route.fulfill({
        status: replies.status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: { message: 'mocked failure' } }),
      });
      return;
    }
    const content =
      kind === 'mark'
        ? (replies.mark ?? marksReply(0, 'correct'))
        : (replies.quiz[Math.min(quizzes++, replies.quiz.length - 1)] ?? '');
    await route.fulfill({
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ choices: [{ message: { content } }], usage: { total_tokens: 500 } }),
    });
  });
  return {
    sent,
    quizzes: () => sent.filter((r) => r.kind === 'quiz'),
    markings: () => sent.filter((r) => r.kind === 'mark'),
  };
}

export const quizDialog = (page: Page) => page.getByRole('dialog', { name: 'Quiz', exact: true });
export const weakPointsDialog = (page: Page) => page.getByRole('dialog', { name: 'Weak points' });
export const settingsDialog = (page: Page) => page.getByRole('dialog', { name: 'AI settings', exact: true });

/** Opens the quiz from the Learn menu and waits for its set-up screen. */
export async function openQuiz(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Learn', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Quiz' }).click();
  const dialog = quizDialog(page);
  await expect(dialog).toBeVisible();
  return dialog;
}

const LEVEL_LABELS: Record<DifficultyChoice, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  all: 'All levels',
};

const TYPE_LABELS: Record<TypeChoice, string> = {
  choice: 'Multiple choice',
  line: 'One-line answer',
  theory: 'Short theory',
  mix: 'Mix',
};

export interface SetupChoices extends Partial<QuizShape> {
  time?: 'Off' | 'Timer' | 'Stopwatch';
  /** With `time: 'Timer'`: a preset, or a custom number of minutes. */
  minutes?: number;
  source?: 'Your model' | 'The built-in sample';
}

/** Picks the set-up options. Anything left out keeps the screen's default. */
export async function chooseSetup(dialog: Locator, choices: SetupChoices): Promise<void> {
  const pick = (name: string) => dialog.getByRole('radio', { name, exact: true }).check();
  if (choices.difficulty) await pick(LEVEL_LABELS[choices.difficulty]);
  if (choices.count) await pick(String(choices.count));
  if (choices.type) await pick(TYPE_LABELS[choices.type]);
  if (choices.time) await pick(choices.time);
  if (choices.minutes !== undefined) {
    if ([5, 10, 15].includes(choices.minutes)) await pick(`${choices.minutes} minutes`);
    else {
      await pick('Custom');
      await dialog.getByRole('spinbutton', { name: 'Minutes' }).fill(String(choices.minutes));
    }
  }
  if (choices.source) await pick(choices.source);
}

export const startButton = (dialog: Locator) => dialog.getByRole('button', { name: 'Start the quiz' });

/** Chooses the options, starts, and waits until the questions are on screen. */
export async function startQuiz(dialog: Locator, choices: SetupChoices = {}): Promise<void> {
  await chooseSetup(dialog, choices);
  await startButton(dialog).click();
  await expect(dialog.locator('ol > li').first()).toBeVisible({ timeout: 15_000 });
}

/** The questions on the running or result screen, in order. */
export const questionItems = (dialog: Locator) => dialog.locator('ol > li');

/** The text of a question, without its number. */
export async function questionText(item: Locator): Promise<string> {
  const label = await item.locator('legend, label, p').first().textContent();
  return (label ?? '').replace(/^\d+\.\s*/, '').trim();
}

/** The step number a question names, from its chip. */
export async function namedStep(item: Locator): Promise<number> {
  const chip = await item.getByText(/^Step \d+:/).textContent();
  const match = /^Step (\d+):/.exec(chip ?? '');
  if (!match) throw new Error(`The question names no step: ${chip}`);
  return Number(match[1]);
}

/** Answers every question wrong: a wrong option, or words that match no keyword. */
export async function answerAllWrong(dialog: Locator): Promise<void> {
  for (const item of await questionItems(dialog).all()) {
    const radios = item.getByRole('radio');
    if ((await radios.count()) > 0) {
      const sample = sampleFor(await questionText(item));
      const wrong = (sample.options ?? []).find((option) => option !== sample.answer);
      if (!wrong) throw new Error('No wrong option');
      await item.getByRole('radio', { name: wrong, exact: true }).check();
    } else {
      await item.getByRole('textbox').fill('No idea at all');
    }
  }
}

/** Answers every question with the sample's own answer. */
export async function answerAllRight(dialog: Locator): Promise<void> {
  for (const item of await questionItems(dialog).all()) {
    const sample = sampleFor(await questionText(item));
    if ((await item.getByRole('radio').count()) > 0) {
      await item.getByRole('radio', { name: sample.answer, exact: true }).check();
    } else {
      await item.getByRole('textbox').fill(sample.answer);
    }
  }
}

export const submitButton = (dialog: Locator) => dialog.getByRole('button', { name: 'Submit', exact: true });

/** Submits and waits for the score. */
export async function submitQuiz(dialog: Locator): Promise<void> {
  await submitButton(dialog).click();
  await expect(dialog.getByRole('heading', { name: /^Score: / })).toBeVisible();
}

/** Console errors and uncaught exceptions, to be empty at the end of a test. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

/** The sample quiz every spec can rely on: the five easy multiple choice questions, in flow order. */
export const EASY_CHOICE: SetupChoices = { difficulty: 'easy', type: 'choice', count: 5 };
export const EASY_CHOICE_COUNT = EASY.filter((sample) => sample.type === 'choice').length;

/**
 * Stops the page's clock, which `page.clock.install()` left running, so a time read on screen is
 * exact however busy the machine is. From here time moves only with `page.clock.fastForward`.
 */
export const freezeClock = (page: Page) => page.clock.pauseAt(Date.now() + 60_000);
