import { z } from 'zod';

import { mdText } from '../lib/markdown.ts';
import { hashStr } from '../lib/util.ts';
import { dbDelete, dbGet, dbUpdate } from './db.ts';

/**
 * Weak points (plan section 8.9): what the user got wrong in a quiz, kept in this browser. The quiz
 * writes them and shows the list; the day recap reads them. Stored data is untrusted, so every
 * record is checked with Zod on the way in and a bad one is dropped without touching the others.
 *
 * Use `flowId(flow)` from `./notes.ts` for `flowId`.
 */

const FLOW_MAX = 300;
const CHAPTER_MAX = 200;
const TOPIC_MAX = 120;
const QUESTION_MAX = 600;
const ANSWER_MAX = 2000;

const WeakPointSchema = z.object({
  /** Stable for the same question in the same flow. */
  id: z.string().min(1).max(64),
  flowId: z.string().min(1).max(FLOW_MAX),
  /** The flow's title when the mistake was made. */
  flow: z.string().max(FLOW_MAX),
  /** The step number shown on screen, from 1. */
  step: z.number().int().min(1),
  chapter: z.string().max(CHAPTER_MAX),
  topic: z.string().min(1).max(TOPIC_MAX),
  question: z.string().min(1).max(QUESTION_MAX),
  userAnswer: z.string().max(ANSWER_MAX),
  correctAnswer: z.string().max(ANSWER_MAX),
  whyWrong: z.string().max(ANSWER_MAX),
  /** ISO time of the latest miss. A correct answer later does not change it. */
  date: z.iso.datetime(),
  /** Goes up on a miss and down on a correct answer. The record is removed at zero. */
  timesMissed: z.number().int().min(1).max(9999),
});

export type WeakPoint = z.infer<typeof WeakPointSchema>;

/** What the quiz knows about a mistake when it happens. */
export type Miss = Omit<WeakPoint, 'id' | 'date' | 'timesMissed'>;

export const WEAK_POINTS_KEY = 'swv:weak-points';

/** The oldest records go first when the list grows past this. */
const MAX_POINTS = 500;

const pointId = (flowId: string, question: string): string =>
  hashStr(`${flowId}|${question.trim().toLowerCase().replace(/\s+/g, ' ')}`);

function validPoints(stored: unknown): WeakPoint[] {
  if (!Array.isArray(stored)) return [];
  return stored.flatMap((item) => {
    const record = WeakPointSchema.safeParse(item);
    return record.success ? [record.data] : [];
  });
}

const newestFirst = (a: WeakPoint, b: WeakPoint): number => b.date.localeCompare(a.date);

/** Every valid record, newest miss first. */
export async function loadWeakPoints(): Promise<WeakPoint[]> {
  return validPoints(await dbGet(WEAK_POINTS_KEY)).sort(newestFirst);
}

/** Saves a miss, or raises the count when the same question was missed before. */
export async function recordMiss(miss: Miss, now: Date = new Date()): Promise<void> {
  const clipped: Miss = {
    ...miss,
    flowId: miss.flowId.slice(0, FLOW_MAX),
    flow: miss.flow.slice(0, FLOW_MAX),
    chapter: miss.chapter.slice(0, CHAPTER_MAX),
    topic: miss.topic.slice(0, TOPIC_MAX),
    question: miss.question.slice(0, QUESTION_MAX),
    userAnswer: miss.userAnswer.slice(0, ANSWER_MAX),
    correctAnswer: miss.correctAnswer.slice(0, ANSWER_MAX),
    whyWrong: miss.whyWrong.slice(0, ANSWER_MAX),
  };
  const id = pointId(clipped.flowId, clipped.question);
  await dbUpdate(WEAK_POINTS_KEY, (stored) => {
    const points = validPoints(stored);
    const earlier = points.find((point) => point.id === id);
    const fresh: WeakPoint = {
      ...clipped,
      id,
      date: now.toISOString(),
      timesMissed: (earlier?.timesMissed ?? 0) + 1,
    };
    const others = points.filter((point) => point !== earlier);
    return [fresh, ...others].sort(newestFirst).slice(0, MAX_POINTS);
  });
}

export interface CorrectAnswer {
  flowId: string;
  topic: string;
  question: string;
}

/**
 * Lowers one count after a correct answer: the same question when it is on the list, otherwise the
 * oldest record on the same topic in that flow. Generated questions rarely repeat word for word.
 */
export async function recordCorrect({ flowId, topic, question }: CorrectAnswer): Promise<void> {
  const id = pointId(flowId, question);
  await dbUpdate(WEAK_POINTS_KEY, (stored) => {
    const points = validPoints(stored).sort(newestFirst);
    const onTopic = points.filter((point) => point.flowId === flowId && point.topic === topic);
    const target = points.find((point) => point.id === id) ?? onTopic[onTopic.length - 1];
    if (!target) return points;
    if (target.timesMissed > 1) {
      return points.map((point) =>
        point === target ? { ...point, timesMissed: point.timesMissed - 1 } : point,
      );
    }
    return points.filter((point) => point !== target);
  });
}

/** Clears one flow's records, or all of them. */
export async function clearWeakPoints(flowId?: string): Promise<void> {
  if (flowId === undefined) {
    await dbDelete(WEAK_POINTS_KEY);
    return;
  }
  await dbUpdate(WEAK_POINTS_KEY, (stored) =>
    validPoints(stored).filter((point) => point.flowId !== flowId),
  );
}

/** The topics missed most in a flow (or in every flow, for null), most missed first. */
export function weakTopics(points: WeakPoint[], flowId: string | null, limit = 5): string[] {
  const counts = new Map<string, number>();
  for (const point of points) {
    if (flowId !== null && point.flowId !== flowId) continue;
    counts.set(point.topic, (counts.get(point.topic) ?? 0) + point.timesMissed);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([topic]) => topic);
}

/** The list as a Markdown file. */
export function weakPointsMarkdown(points: WeakPoint[]): string {
  const blocks = points.map((point) =>
    [
      `## ${mdText(point.question)}`,
      `- **Flow:** ${mdText(point.flow)}`,
      `- **Step:** ${point.step}${point.chapter ? ` (${mdText(point.chapter)})` : ''}`,
      `- **Topic:** ${mdText(point.topic)}`,
      `- **Your answer:** ${mdText(point.userAnswer) || 'Not answered'}`,
      `- **Correct answer:** ${mdText(point.correctAnswer)}`,
      `- **Why it was wrong:** ${mdText(point.whyWrong)}`,
      `- **Last missed:** ${point.date.slice(0, 10)}`,
      `- **Times missed:** ${point.timesMissed}`,
    ].join('\n'),
  );
  return [`# Weak points`, ...blocks].join('\n\n') + '\n';
}

/**
 * "Retry my mistakes": whoever wants a quiz on some topics writes this key to sessionStorage and
 * then calls `setUi({ quizOpen: true })`. The quiz's set-up screen reads and clears it.
 */
export const QUIZ_RETRY_KEY = 'swv:quiz:retry';

const QuizRetrySchema = z.object({
  topics: z.array(z.string().min(1).max(TOPIC_MAX)).min(1).max(50),
  flowId: z.string().min(1).max(FLOW_MAX).nullable(),
});

export type QuizRetry = z.infer<typeof QuizRetrySchema>;

export function requestQuizRetry(retry: QuizRetry): void {
  try {
    sessionStorage.setItem(QUIZ_RETRY_KEY, JSON.stringify(retry));
  } catch {
    /* blocked storage: the quiz opens with its normal set-up */
  }
}

export function takeQuizRetry(): QuizRetry | null {
  try {
    const raw = sessionStorage.getItem(QUIZ_RETRY_KEY);
    if (raw === null) return null;
    sessionStorage.removeItem(QUIZ_RETRY_KEY);
    const retry = QuizRetrySchema.safeParse(JSON.parse(raw));
    return retry.success ? retry.data : null;
  } catch {
    return null;
  }
}
