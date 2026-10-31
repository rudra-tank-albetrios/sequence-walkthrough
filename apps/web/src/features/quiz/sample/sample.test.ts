import { parseFlow, type Flow } from '@swv/core';
import { describe, expect, it } from 'vitest';

import demoOnDisk from '../../../../../../examples/demo-store/flows/place-order.mmd?raw';
import { DEFAULT_DIAGRAM } from '../../../shared/lib/defaultDiagram.ts';
import { marksFor } from '../marking.ts';
import { isSupported, stepEvidence, unsupportedFacts } from '../support.ts';
import {
  DEFAULT_CONFIG,
  DIFFICULTIES,
  LEVELS,
  QUESTION_TYPES,
  type Question,
  type QuizConfig,
} from '../types.ts';
import { EASY } from './easy.ts';
import { HARD } from './hard.ts';
import { pickSample, sampleQuestions } from './index.ts';
import { MEDIUM } from './medium.ts';

// The demo flow as it is on disk, read with the parser the viewer uses.
const flow: Flow = parseFlow(demoOnDisk).flow;
const written = [...EASY, ...MEDIUM, ...HARD];
const questions = sampleQuestions(flow);

const seeded = () => {
  let seed = 7;
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
};

const config = (patch: Partial<QuizConfig>): QuizConfig => ({ ...DEFAULT_CONFIG, ...patch });

describe('the built-in sample quiz, against the demo flow on disk', () => {
  it('is checked against the flow the page ships', () => {
    expect(DEFAULT_DIAGRAM).toBe(demoOnDisk);
    expect(flow.isSequence).toBe(true);
    expect(flow.steps.length).toBeGreaterThan(0);
  });

  // These two prove the sample stays true. If the demo flow changes, they name the question to fix.
  it.each(written.map((sample) => [sample.question, sample] as const))(
    'names a real step and the flow supports its answer: %s',
    (_, sample) => {
      const step = flow.steps.find((candidate) => candidate.key === sample.step);
      expect(step, `no step with the key ${sample.step}`).toBeDefined();
      if (!step) return;
      const evidence = stepEvidence(flow, step);
      expect(isSupported(sample.answer, evidence)).toBe(true);
      expect(unsupportedFacts(sample.why, evidence)).toEqual([]);
      if (sample.options) expect(sample.options).toContain(sample.answer);
    },
  );

  it('loses no question to the checks a model reply goes through', () => {
    const accepted = new Set(questions.map((question) => question.text));
    expect(written.filter((sample) => !accepted.has(sample.question)).map((s) => s.question)).toEqual([]);
  });

  it('has five questions of every type at every level', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const type of QUESTION_TYPES) {
        const found = questions.filter((q) => q.difficulty === difficulty && q.type === type);
        expect(found, `${difficulty} ${type}`).toHaveLength(5);
      }
    }
  });

  it('uses only the topics of each level, and every topic at least once', () => {
    for (const difficulty of DIFFICULTIES) {
      const topics = new Set(questions.filter((q) => q.difficulty === difficulty).map((q) => q.topic));
      expect([...topics].sort()).toEqual([...LEVELS[difficulty].topics].sort());
    }
  });

  it('has unique questions and ids', () => {
    expect(new Set(questions.map((q) => q.text)).size).toBe(questions.length);
    expect(new Set(questions.map((q) => q.id)).size).toBe(questions.length);
  });

  it('gives multiple choice four options holding the answer, and written ones keywords', () => {
    for (const question of questions) {
      if (question.type === 'choice') {
        expect(question.options).toHaveLength(4);
        expect(question.options).toContain(question.answer);
        expect(question.keywords).toBeUndefined();
      } else {
        expect(question.options).toEqual([]);
        expect(question.keywords?.length).toBeGreaterThan(0);
      }
    }
  });

  it('marks its own model answer as correct, and something unrelated as wrong', () => {
    const written = questions.filter((q) => q.type !== 'choice');
    for (const question of written) {
      const id = question.id;
      expect(marksFor([question], { [id]: question.answer })[id]?.value, question.text).toBe('correct');
      expect(marksFor([question], { [id]: 'no idea at all' })[id]?.value, question.text).toBe('wrong');
    }
  });

  it('is empty for any other flow', () => {
    const other = parseFlow('sequenceDiagram\n  %% @title Other\n  A->>B: POST /x\n  B-->>A: 200 OK').flow;
    expect(sampleQuestions(other)).toEqual([]);
  });

  it('leaves out a question whose answer an edited flow no longer backs up', () => {
    const edited = parseFlow(DEFAULT_DIAGRAM.replace(/401 Unauthorized/g, '400 Bad Request')).flow;
    const left = sampleQuestions(edited);
    expect(left.length).toBeGreaterThan(0);
    expect(left.some((q) => q.answer.includes('401'))).toBe(false);
  });
});

describe('choosing a quiz from the sample', () => {
  const pick = (patch: Partial<QuizConfig>, weak: string[] = [], recent: string[] = []): Question[] =>
    pickSample(flow, config(patch), { weak, recent, random: seeded() });

  it.each(DIFFICULTIES)('gives 5, 10 and 15 questions of the mix at level %s', (difficulty) => {
    for (const count of [5, 10, 15] as const) {
      const quiz = pick({ difficulty, count, type: 'mix' });
      expect(quiz).toHaveLength(count);
      expect(quiz.every((q) => q.difficulty === difficulty)).toBe(true);
      expect(new Set(quiz.map((q) => q.type)).size).toBe(3);
      expect(new Set(quiz.map((q) => q.id)).size).toBe(count);
    }
  });

  it.each(QUESTION_TYPES)('asks only the chosen type: %s', (type) => {
    const quiz = pick({ type, count: 5, difficulty: 'hard' });
    expect(quiz).toHaveLength(5);
    expect(quiz.every((q) => q.type === type)).toBe(true);
  });

  it('gives some of each level for "all levels"', () => {
    const quiz = pick({ difficulty: 'all', count: 15, type: 'mix' });
    expect(quiz).toHaveLength(15);
    for (const difficulty of DIFFICULTIES) {
      expect(quiz.filter((q) => q.difficulty === difficulty)).toHaveLength(5);
    }
  });

  it('gives what it has when asked for more of one kind than it holds', () => {
    expect(pick({ type: 'choice', difficulty: 'easy', count: 15 })).toHaveLength(5);
  });

  it('puts the questions in flow order', () => {
    const steps = pick({ difficulty: 'all', count: 15 }).map((q) => q.stepIndex);
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
  });

  it('asks weak topics first', () => {
    const quiz = pick({ difficulty: 'hard', type: 'line', count: 5 }, ['Why the order matters']);
    expect(quiz.some((q) => q.topic === 'Why the order matters')).toBe(true);
    const withWeak = pick({ difficulty: 'easy', type: 'mix', count: 5 }, ['Method and path']);
    const without = pick({ difficulty: 'easy', type: 'mix', count: 5 }, []);
    const count = (quiz: Question[]) => quiz.filter((q) => q.topic === 'Method and path').length;
    expect(count(withWeak)).toBeGreaterThan(count(without));
  });

  it('asks recent questions last', () => {
    const first = pick({ difficulty: 'easy', type: 'mix', count: 5 });
    const second = pick(
      { difficulty: 'easy', type: 'mix', count: 5 },
      [],
      first.map((q) => q.text),
    );
    expect(second.filter((q) => first.some((f) => f.id === q.id))).toEqual([]);
  });

  it('asks only the focus topics, whatever the level', () => {
    const quiz = pick({ focus: ['Status codes', 'What happens on failure'], count: 15 });
    expect(quiz.length).toBeGreaterThan(5);
    expect(quiz.every((q) => ['Status codes', 'What happens on failure'].includes(q.topic))).toBe(true);
  });

  it('gives nothing for a focus topic the sample does not have', () => {
    expect(pick({ focus: ['Something else'] })).toEqual([]);
  });
});
