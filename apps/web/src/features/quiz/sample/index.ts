import type { Flow } from '@swv/core';

import { hashStr } from '../../../shared/lib/util.ts';
import { planSlots } from '../plan.ts';
import { DIFFICULTIES, type Difficulty, type Question, type QuizConfig } from '../types.ts';
import { checkQuestion, normalizeText } from '../validate.ts';
import { EASY } from './easy.ts';
import { HARD } from './hard.ts';
import { MEDIUM } from './medium.ts';
import type { SampleQuestion } from './types.ts';

/**
 * The built-in quiz for the demo flow, so the feature works with no model and no key (plan section
 * 2, decision 22). It goes through the same check as a model's reply: a question whose step is gone
 * or whose answer the flow no longer backs up is left out, so any other flow simply has no sample.
 */
const SAMPLE: Record<Difficulty, readonly SampleQuestion[]> = {
  easy: EASY,
  medium: MEDIUM,
  hard: HARD,
};

function fromSample(sample: SampleQuestion, flow: Flow, difficulty: Difficulty): Question | null {
  const step = flow.steps.find((candidate) => candidate.key === sample.step);
  if (!step) return null;
  const checked = checkQuestion(
    {
      type: sample.type,
      step: step.n,
      topic: sample.topic,
      question: sample.question,
      answer: sample.answer,
      why: sample.why,
      ...(sample.options ? { options: sample.options } : {}),
    },
    flow,
    difficulty,
  );
  if (!checked.ok) return null;
  return {
    ...checked.question,
    id: hashStr(sample.question),
    ...(sample.keywords ? { keywords: sample.keywords } : {}),
  };
}

const cache = new WeakMap<Flow, Question[]>();

/** Every sample question this flow backs up; empty for any flow but the demo. */
export function sampleQuestions(flow: Flow): Question[] {
  let questions = cache.get(flow);
  if (!questions) {
    const valid = DIFFICULTIES.flatMap((difficulty) =>
      SAMPLE[difficulty].flatMap((sample) => {
        const question = fromSample(sample, flow, difficulty);
        return question ? [question] : [];
      }),
    );
    questions = valid;
    cache.set(flow, questions);
  }
  return questions;
}

export interface PickMemory {
  /** Topics the user keeps missing: asked first. */
  weak: readonly string[];
  /** Question texts asked lately: asked last. */
  recent: readonly string[];
  random?: () => number;
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return out;
}

/**
 * Chooses a quiz from the sample, as many as it has up to the count: focus topics only when there
 * are any, weak topics before others and recent questions last. In flow order, so it reads along.
 */
export function pickSample(flow: Flow, config: QuizConfig, memory: PickMemory): Question[] {
  const weak = new Set(memory.weak);
  const recent = new Set(memory.recent.map(normalizeText));
  const focus = new Set(config.focus);
  const rank = (question: Question): number =>
    (weak.has(question.topic) ? 0 : 2) + (recent.has(normalizeText(question.text)) ? 1 : 0);
  const pool = shuffled(sampleQuestions(flow), memory.random ?? Math.random)
    .filter((question) => focus.size === 0 || focus.has(question.topic))
    .sort((a, b) => rank(a) - rank(b));

  const chosen: Question[] = [];
  for (const slot of planSlots(config)) {
    const fits = (question: Question): boolean =>
      question.type === slot.type && (focus.size > 0 || question.difficulty === slot.difficulty);
    const at = pool.findIndex(fits);
    const [question] = at < 0 ? [] : pool.splice(at, 1);
    if (question) chosen.push(question);
  }
  return chosen.sort((a, b) => a.stepIndex - b.stepIndex);
}
