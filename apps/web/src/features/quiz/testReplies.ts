import { parseFlow, type Flow } from '@swv/core';

import { DEFAULT_DIAGRAM } from '../../shared/lib/defaultDiagram.ts';
import { planSlots } from './plan.ts';
import { EASY } from './sample/easy.ts';
import { HARD } from './sample/hard.ts';
import { MEDIUM } from './sample/medium.ts';
import type { SampleQuestion } from './sample/types.ts';
import { DEFAULT_CONFIG, type Difficulty, type QuizConfig } from './types.ts';

/** For tests: what a well-behaved model would answer about the demo flow. */

export const demoFlow: Flow = parseFlow(DEFAULT_DIAGRAM).flow;

const SAMPLES: Record<Difficulty, readonly SampleQuestion[]> = { easy: EASY, medium: MEDIUM, hard: HARD };

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

function replyItem(sample: SampleQuestion, level: Difficulty): ReplyItem {
  const step = demoFlow.steps.find((candidate) => candidate.key === sample.step);
  if (!step) throw new Error(`The demo flow has no step ${sample.step}`);
  return {
    type: sample.type,
    step: step.n,
    level,
    topic: sample.topic,
    question: sample.question,
    ...(sample.options ? { options: sample.options } : {}),
    answer: sample.answer,
    why: sample.why,
  };
}

/** Good questions for every place in this quiz, in order. `skip` takes later samples instead. */
export function goodItems(patch: Partial<QuizConfig> = {}, skip = 0): ReplyItem[] {
  const used = new Map<string, number>();
  return planSlots({ ...DEFAULT_CONFIG, ...patch }).map(({ difficulty, type }) => {
    const pairs = SAMPLES[difficulty].filter((sample) => sample.type === type);
    const key = `${difficulty}:${type}`;
    const index = used.get(key) ?? skip;
    used.set(key, index + 1);
    const sample = pairs[index];
    if (!sample) throw new Error(`The sample has no question ${String(index)} for ${key}`);
    return replyItem(sample, difficulty);
  });
}

export const quizReply = (items: readonly unknown[]): string => JSON.stringify({ questions: items });
