import { mockFetch, resetAiStorage, seedModels, type MockFetch } from '@swv/ai/testing';
import { parseFlow } from '@swv/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FLOWS_KEY, rememberFlow } from '../../shared/storage/flowHistory.ts';
import { Store } from '../../shared/storage/store.ts';
import { connectedFlows, MAX_CONNECTED, mergeQuiz } from './connect.ts';
import { generateAcross, generateQuestions, QuizError } from './generate.ts';
import { demoFlow, goodItems, quizReply } from './testReplies.ts';
import { DEFAULT_CONFIG, type Question, type QuizConfig } from './types.ts';

const OTHER = `sequenceDiagram
  %% @title Refunds
  %% @section Ask
  %% @step The call
  A->>B: GET /refunds
  %% @step The reply
  B-->>A: 200 OK`;
const other = parseFlow(OTHER).flow;

const config = (patch: Partial<QuizConfig> = {}): QuizConfig => ({
  ...DEFAULT_CONFIG,
  type: 'choice',
  ...patch,
});

const refundQuestion = (question: string, answer = '200 OK') => ({
  type: 'choice',
  level: 'easy',
  step: 2,
  topic: 'Status codes',
  question,
  options: ['200 OK', '401 Unauthorized', '404 Not Found', '500 Server Error'],
  answer,
  why: 'The reply says 200 OK.',
});

let mock: MockFetch | null = null;
const replies = (...texts: string[]): MockFetch => {
  seedModels({});
  mock = mockFetch(texts.map((reply) => ({ reply })));
  return mock;
};
const prompt = (fetched: MockFetch, call: number): string =>
  fetched.calls[call]?.body.messages?.find((message) => message.role === 'user')?.content ?? '';

const across = (patch: Partial<Parameters<typeof generateAcross>[0]> = {}) =>
  generateAcross({
    flow: demoFlow,
    connected: [{ id: 't:Refunds', flow: other }],
    config: config(),
    avoid: [],
    weakOf: () => [],
    id: 't:Demo',
    ...patch,
  });

beforeEach(() => {
  resetAiStorage();
  Store.del(FLOWS_KEY);
});

afterEach(() => {
  mock?.restore();
  mock = null;
  resetAiStorage();
});

describe('connected flows', () => {
  it('reads chosen flows from what was kept, and leaves out any it does not hold', () => {
    rememberFlow(other, OTHER);
    expect(connectedFlows(['t:Refunds', 't:Gone']).map((part) => part.flow.title)).toEqual(['Refunds']);
    expect(connectedFlows([])).toEqual([]);
  });

  it('takes no more than the limit', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'].map((name) => {
      const text = OTHER.replace('Refunds', name).replace('/refunds', `/${name}`);
      rememberFlow(parseFlow(text).flow, text);
      return `t:${name}`;
    });
    expect(connectedFlows(ids)).toHaveLength(MAX_CONNECTED);
  });

  it('asks about each flow in its own request, sharing the places, with only that flow in it', async () => {
    const fetched = replies(
      quizReply(goodItems({ type: 'choice' }).slice(0, 3)),
      quizReply([refundQuestion('Which status does the reply carry?')].concat(
        refundQuestion('What does the reply say when the refund is found?'),
      )),
      quizReply([refundQuestion('Which reply comes back to A from B?', '200 OK')]),
    );
    const { parts, skipped } = await across();
    expect(skipped).toEqual([]);
    expect(parts.map((part) => part.questions.length)).toEqual([3, 1]);
    expect(prompt(fetched, 0)).toContain('Write exactly 3 questions');
    expect(prompt(fetched, 0)).toContain(demoFlow.title);
    expect(prompt(fetched, 0)).not.toContain('/refunds');
    expect(prompt(fetched, 1)).toContain('Write exactly 2 questions');
    expect(prompt(fetched, 1)).toContain('/refunds');
    expect(prompt(fetched, 1)).not.toContain(demoFlow.title);
  });

  it('never repeats a question of an earlier flow, and tells the next flow what was asked', async () => {
    const [first] = goodItems({ type: 'choice' });
    const fetched = replies(
      quizReply(goodItems({ type: 'choice' }).slice(0, 3)),
      quizReply([
        refundQuestion(first?.question ?? ''),
        refundQuestion('Which status does the reply carry?'),
      ]),
      quizReply([refundQuestion('Which status does the reply carry?')]),
    );
    const { parts } = await across();
    expect(prompt(fetched, 1)).toContain(`- ${(first?.question ?? '').slice(0, 80)}`);
    const texts = parts.flatMap((part) => part.questions.map((question) => question.text));
    expect(new Set(texts).size).toBe(texts.length);
    expect(texts.filter((text) => text === first?.question)).toHaveLength(1);
  });

  it('keeps the quiz when one flow gives nothing usable, and names that flow', async () => {
    replies(quizReply(goodItems({ type: 'choice' }).slice(0, 3)), 'nothing useful', 'still nothing');
    const { parts, skipped } = await across();
    expect(parts.map((part) => part.flow.title)).toEqual([demoFlow.title]);
    expect(skipped).toEqual(['Refunds']);
  });

  it('gives up with the reason when too little came back overall', async () => {
    replies('nothing', 'nothing', 'nothing', 'nothing');
    await expect(across()).rejects.toThrow(QuizError);
  });

  it('merges the questions, leaving the flow on screen in place and marking the rest', () => {
    const baseQuestion: Question = {
      id: 'q1',
      type: 'line',
      difficulty: 'easy',
      stepIndex: 2,
      topic: 'Status codes',
      text: 'One?',
      options: [],
      answer: 'a',
      why: 'b',
    };
    const { flow, questions } = mergeQuiz(demoFlow, [
      { id: '', flow: demoFlow, questions: [baseQuestion] },
      { id: 't:Refunds', flow: other, questions: [{ ...baseQuestion, text: 'Two?', stepIndex: 1 }] },
    ]);
    expect(questions.map((question) => question.id)).toEqual(['q1', 'q2']);
    expect(questions[0]).not.toHaveProperty('from');
    expect(questions[0]?.stepIndex).toBe(2);
    expect(questions[1]?.from).toEqual({ id: 't:Refunds', title: 'Refunds' });
    const moved = flow.steps[questions[1]?.stepIndex ?? -1];
    expect(moved?.n).toBe(2);
    expect(moved?.labelRaw).toContain('200 OK');
    expect(flow.sections[moved?.section ?? -1]?.name).toContain('Refunds:');
    expect(flow.title).toBe(demoFlow.title);
  });

  it('returns the flow on screen untouched when nothing is connected', () => {
    expect(mergeQuiz(demoFlow, [{ id: '', flow: demoFlow, questions: [] }]).flow).toBe(demoFlow);
  });
});

describe('questions that repeat or leave the flow', () => {
  const base = { flow: demoFlow, config: config(), avoid: [], weak: [] };

  it('refuses a lightly reworded question, but not one about another fact', async () => {
    const [first, second, ...rest] = goodItems({ type: 'choice' });
    if (!first || !second) throw new Error('No questions');
    const reworded = { ...second, question: `So then, ${first.question}` };
    const fetched = replies(quizReply([first, reworded, ...rest]), quizReply([second]));
    const questions = await generateQuestions(base);
    expect(questions).toHaveLength(5);
    expect(prompt(fetched, 1)).toContain('repeats an earlier question');
  });

  it('tests one fact of a step only once', async () => {
    const [first, ...rest] = goodItems({ type: 'choice' });
    if (!first) throw new Error('No questions');
    const again = { ...first, question: `In other words, ${first.question} Explain which one.` };
    const fetched = replies(quizReply([first, again, ...rest.slice(0, 3)]), quizReply(rest.slice(3)));
    await generateQuestions(base);
    expect(prompt(fetched, 1)).toContain('tests the same fact');
  });

  it('refuses a question naming what the flow does not show', async () => {
    const [first, ...rest] = goodItems({ type: 'choice' });
    if (!first) throw new Error('No questions');
    const foreign = { ...first, question: 'What does kafkaProducer do on this step?' };
    const fetched = replies(quizReply([foreign, ...rest]), quizReply([first]));
    const questions = await generateQuestions(base);
    expect(questions.map((question) => question.text)).not.toContain(foreign.question);
    expect(prompt(fetched, 1)).toContain('the flow does not show "kafkaproducer"');
  });
});
