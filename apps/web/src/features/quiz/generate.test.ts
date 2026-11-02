import { estimateTokens, MAX_PROMPT_TOKENS } from '@swv/ai';
import { mockFetch, mockModel, resetAiStorage, seedModels, type MockFetch } from '@swv/ai/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { generateQuestions, QuizError, type GenerateArgs } from './generate.ts';
import { quizPrompt, QUIZ_SYSTEM } from './prompt.ts';
import { demoFlow, goodItems, quizReply, type ReplyItem } from './testReplies.ts';
import { DEFAULT_CONFIG, type QuizConfig } from './types.ts';

const config = (patch: Partial<QuizConfig> = {}): QuizConfig => ({ ...DEFAULT_CONFIG, ...patch });
const args = (patch: Partial<GenerateArgs> = {}): GenerateArgs => ({
  flow: demoFlow,
  config: config(),
  avoid: [],
  weak: [],
  ...patch,
});

/** Five good questions with the first one changed. */
function firstChanged(patch: Partial<ReplyItem>): ReplyItem[] {
  const [first, ...rest] = goodItems();
  if (!first) throw new Error('No questions');
  return [{ ...first, ...patch }, ...rest];
}

let mock: MockFetch | null = null;

const repliesInOrder = (...replies: string[]): MockFetch => {
  seedModels({});
  mock = mockFetch(replies.map((reply) => ({ reply })));
  return mock;
};

const userMessage = (fetched: MockFetch, call: number): string =>
  fetched.calls[call]?.body.messages?.find((message) => message.role === 'user')?.content ?? '';

beforeEach(() => {
  resetAiStorage();
});

afterEach(() => {
  mock?.restore();
  mock = null;
  resetAiStorage();
});

describe('writing a quiz with a model', () => {
  it('takes five good questions in one call within 3,000 reply tokens', async () => {
    mock = mockModel({ reply: quizReply(goodItems()) });
    const questions = await generateQuestions(args());
    expect(questions).toHaveLength(5);
    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0]?.body.max_tokens).toBe(3000);
    for (const question of questions) {
      expect(demoFlow.steps[question.stepIndex]).toBeDefined();
      expect(question.difficulty).toBe('easy');
    }
    expect(new Set(questions.map((question) => question.id)).size).toBe(5);
  });

  it('asks for a longer quiz five questions at a time, each batch within the same budget', async () => {
    const all = goodItems({ count: 15, difficulty: 'all' });
    seedModels({});
    const fetched = mockFetch(() => ({ reply: quizReply(all.slice(fetched.calls.length * 5 - 5, fetched.calls.length * 5)) }));
    mock = fetched;
    const questions = await generateQuestions(args({ config: config({ count: 15, difficulty: 'all' }) }));
    expect(questions).toHaveLength(15);
    expect(fetched.calls).toHaveLength(3);
    expect(fetched.calls.map((call) => call.body.max_tokens)).toEqual([3000, 3000, 3000]);
    expect(userMessage(fetched, 0)).toContain('Write exactly 5 questions');
    // The second batch knows the first, so it asks about other steps and other questions.
    const second = userMessage(fetched, 1);
    expect(second).toContain('Steps already asked about, so prefer other steps:');
    expect(second).toContain(`- ${all[0]?.question.slice(0, 80) ?? ''}`);
    expect(new Set(questions.map((question) => question.difficulty)).size).toBe(3);
    expect(new Set(questions.map((question) => question.id)).size).toBe(15);
  });

  it('takes a whole longer quiz from one generous reply', async () => {
    mock = mockModel({ reply: quizReply(goodItems({ count: 15, difficulty: 'all' })) });
    const questions = await generateQuestions(args({ config: config({ count: 15, difficulty: 'all' }) }));
    expect(questions).toHaveLength(15);
    expect(mock.calls).toHaveLength(1);
  });

  it('sends the flow with the facts of each step and the topics explained', async () => {
    mock = mockModel({ reply: quizReply(goodItems()) });
    await generateQuestions(args());
    const sent = userMessage(mock, 0);
    expect(sent).toContain('(reply)');
    expect(sent).toContain('Terms: hold:');
    expect(sent).toContain('The first caller finally receives: step');
    expect(QUIZ_SYSTEM).toContain('Status codes: the status code and reason of a reply step');
  });

  it('sends the flow as marked data and never the diagram code', async () => {
    mock = mockModel({ reply: quizReply(goodItems()) });
    await generateQuestions(args());
    const sent = userMessage(mock, 0);
    expect(sent).toContain(demoFlow.title);
    expect(sent).not.toContain('sequenceDiagram');
    expect(sent).not.toContain('%% @');
    expect(sent).toMatch(/data/i);
  });

  it('sends recent questions as "do not repeat" and asks more about weak topics', async () => {
    mock = mockModel({ reply: quizReply(goodItems()) });
    await generateQuestions(
      args({ avoid: ['Which colour is the database?'], weak: ['Status codes', 'Layer order'] }),
    );
    const sent = userMessage(mock, 0);
    expect(sent).toContain('Do not repeat these questions:');
    expect(sent).toContain('Which colour is the database?');
    expect(sent).toContain('Status codes, Layer order');
  });

  it('asks only the topics of "Retry my mistakes"', async () => {
    const topic = 'Status codes';
    const items = goodItems({ type: 'choice' }).map((item) => ({ ...item, topic }));
    mock = mockModel({ reply: quizReply(items) });
    const focused = config({ type: 'choice', difficulty: 'all', focus: [topic] });
    const questions = await generateQuestions(args({ config: focused }));
    expect(questions.every((question) => question.topic === topic)).toBe(true);
    expect(userMessage(mock, 0)).toContain(`Ask only about these topics, and use them as "topic": ${topic}`);
  });

  it('keeps even the longest prompt within what one request may send', () => {
    const long = Array.from({ length: 30 }, (_, i) => `${String(i)} ${'a long recent question '.repeat(20)}`);
    const prompt = quizPrompt({
      flow: demoFlow,
      config: config({ count: 15, difficulty: 'all', focus: Array(50).fill('t'.repeat(60)) as string[] }),
      slots: [{ difficulty: 'easy', type: 'choice' }],
      avoid: long,
      weak: Array(5).fill('t'.repeat(60)) as string[],
      problems: Array(9).fill('p'.repeat(200)) as string[],
    });
    expect(estimateTokens(QUIZ_SYSTEM + prompt)).toBeLessThan(MAX_PROMPT_TOKENS);
  });
});

describe('bad replies from the model', () => {
  it.each([
    ['plain words', 'Sure! Here is your quiz.'],
    ['broken JSON', '{"questions":[{"type":"choice",'],
    ['the wrong shape', JSON.stringify({ quiz: [] })],
    ['a list instead of an object', JSON.stringify([1, 2, 3])],
    ['questions that are not a list', JSON.stringify({ questions: 'none' })],
    ['no questions', JSON.stringify({ questions: [] })],
    ['far too many questions', JSON.stringify({ questions: Array(41).fill({}) })],
    ['numbers for questions', JSON.stringify({ questions: [1, 2, 3, 4, 5] })],
    ['an empty reply', ' '],
  ])('retries once on %s, then shows a clear error', async (_, reply) => {
    const fetched = repliesInOrder(reply);
    const failure = await generateQuestions(args()).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(QuizError);
    expect((failure as QuizError).message).toContain('even after one retry');
    expect((failure as QuizError).needsSettings).toBe(false);
    expect(fetched.calls).toHaveLength(2);
  });

  it('recovers when the retry is good', async () => {
    const fetched = repliesInOrder('not json at all', quizReply(goodItems()));
    await expect(generateQuestions(args())).resolves.toHaveLength(5);
    expect(fetched.calls).toHaveLength(2);
  });

  it('rejects a question naming a missing step and asks again only for that place', async () => {
    // The first reply already holds the sample's first two easy choice questions.
    const fix = goodItems({}, 2).slice(0, 1);
    const fetched = repliesInOrder(quizReply(firstChanged({ step: 9999 })), quizReply(fix));
    const questions = await generateQuestions(args());
    expect(questions).toHaveLength(5);
    expect(fetched.calls).toHaveLength(2);
    expect(fetched.calls[1]?.body.max_tokens).toBe(600);
    const retry = userMessage(fetched, 1);
    expect(retry).toContain('Write exactly 1 questions');
    expect(retry).toContain('step 9999 does not exist');
    expect(questions.map((question) => question.text)).toContain(fix[0]?.question);
  });

  const saucer = 'A flying saucer delivers parcels overnight';
  const madeUp = '599 Totally Made Up';

  it.each<[string, Partial<ReplyItem>, string]>([
    ['a step number of zero', { step: 0 }, 'step 0 does not exist in this flow'],
    ['a negative step number', { step: -3 }, 'step -3 does not exist in this flow'],
    [
      'an answer the flow does not support',
      { answer: saucer, options: [saucer, 'b', 'c', 'd'] },
      'does not support the answer',
    ],
    [
      'a number the flow does not have',
      { answer: madeUp, options: [madeUp, 'b', 'c', 'd'] },
      'does not support the answer',
    ],
    ['a reason with a made-up fact', { why: 'The fakeService answers with 599.' }, 'does not support "599'],
    ['three options', { options: ['a', 'b', 'c'] }, 'exactly four options'],
    ['two options the same', { options: ['a', 'a', 'b', 'c'] }, 'two options are the same'],
    ['an answer that is not an option', { options: ['a', 'b', 'c', 'd'] }, 'the answer is not one of the options'],
  ])('refuses %s, says why on the retry, and keeps the four good questions', async (_, patch, reason) => {
    const fetched = repliesInOrder(quizReply(firstChanged(patch)));
    const questions = await generateQuestions(args());
    expect(questions).toHaveLength(4);
    expect(fetched.calls).toHaveLength(2);
    expect(userMessage(fetched, 1)).toContain('Write exactly 1 questions');
    expect(userMessage(fetched, 1)).toContain(reason);
  });

  it('gives up when fewer than half the questions can be used, and says why', async () => {
    const [first, second] = goodItems();
    if (!first || !second) throw new Error('No questions');
    const bad = { ...first, question: 'Which step is this one?', step: 9999 };
    const fetched = repliesInOrder(quizReply([first, second, bad]));
    const failure = await generateQuestions(args()).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(QuizError);
    expect((failure as QuizError).message).toContain('even after one retry');
    expect((failure as QuizError).message).toContain('step 9999 does not exist');
    expect(fetched.calls).toHaveLength(2);
  });

  it('names an empty reply as a token limit spent on thinking', async () => {
    repliesInOrder('');
    const failure = await generateQuestions(args()).catch((error: unknown) => error);
    expect((failure as QuizError).message).toContain('spent its token limit on thinking');
  });

  it('keeps the whole questions of a reply the token limit cut short, and asks for the rest', async () => {
    const items = goodItems();
    const whole = quizReply(items);
    const cut = whole.slice(0, whole.lastIndexOf('{"type"') + 20);
    const fetched = repliesInOrder(cut, quizReply(items.slice(4)));
    const questions = await generateQuestions(args());
    expect(questions).toHaveLength(5);
    expect(fetched.calls).toHaveLength(2);
    expect(userMessage(fetched, 1)).toContain('Write exactly 1 questions');
    expect(questions.map((question) => question.text)).toContain(items[4]?.question);
  });

  it.each([
    ['a question of the wrong type', { type: 'essay' }],
    ['a step that is not a whole number', { step: 1.5 }],
    ['a step that is text', { step: '7' }],
    ['no answer', { answer: '' }],
    ['a very long question', { question: 'q'.repeat(401) }],
    ['a very long answer', { answer: 'a'.repeat(501) }],
    ['a very long topic', { topic: 't'.repeat(61) }],
  ])('rejects %s by its shape, and says so on the retry', async (_, patch) => {
    const fetched = repliesInOrder(quizReply(firstChanged(patch as Partial<ReplyItem>)));
    await expect(generateQuestions(args())).resolves.toHaveLength(4);
    expect(userMessage(fetched, 1)).toContain('a question did not have the agreed fields');
  });

  it('rejects the same question twice and a recent question', async () => {
    const [first] = goodItems();
    const twice = [first, ...goodItems().slice(0, 4)];
    let fetched = repliesInOrder(quizReply(twice));
    await expect(generateQuestions(args())).resolves.toHaveLength(4);
    expect(userMessage(fetched, 1)).toContain('repeats an earlier question');
    mock?.restore();
    fetched = repliesInOrder(quizReply(goodItems()));
    await expect(generateQuestions(args({ avoid: [first?.question ?? ''] }))).resolves.toHaveLength(4);
    expect(userMessage(fetched, 1)).toContain('repeats an earlier question');
    expect(userMessage(fetched, 0)).toContain(`- ${first?.question ?? ''}`);
  });

  it('rejects a topic outside "Retry my mistakes"', async () => {
    repliesInOrder(quizReply(goodItems({ type: 'choice' })));
    const focused = config({ type: 'choice', difficulty: 'all', focus: ['Not one of these'] });
    await expect(generateQuestions(args({ config: focused }))).rejects.toThrow('was not asked for');
  });

  it('keeps only the agreed fields: a reply cannot add actions', async () => {
    const items = goodItems().map((item) => ({ ...item, action: 'clearData', onload: 'alert(1)' }));
    mock = mockModel({ reply: quizReply(items) });
    const questions = await generateQuestions(args());
    expect(questions).toHaveLength(5);
    for (const question of questions) {
      expect(Object.keys(question)).not.toContain('action');
      expect(Object.keys(question)).not.toContain('onload');
    }
  });

  it('accepts a reply wrapped in a code fence', async () => {
    mock = mockModel({ reply: ['```json', quizReply(goodItems()), '```'].join('\n') });
    await expect(generateQuestions(args())).resolves.toHaveLength(5);
  });
});

describe('when the request itself fails', () => {
  it('opens AI settings when no model is set up', async () => {
    const failure = await generateQuestions(args()).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(QuizError);
    expect((failure as QuizError).needsSettings).toBe(true);
  });

  it('does not retry a failed request, and says what went wrong', async () => {
    mock = mockModel({ status: 401, body: '{"error":{"message":"nope"}}' });
    const failure = await generateQuestions(args()).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(QuizError);
    expect((failure as QuizError).message).not.toContain('even after one retry');
    expect(mock.calls).toHaveLength(1);
  });

  it('stops when the quiz is cancelled', async () => {
    mock = mockModel({ reply: quizReply(goodItems()) });
    const controller = new AbortController();
    controller.abort();
    await expect(generateQuestions(args({ signal: controller.signal }))).rejects.toBeInstanceOf(QuizError);
    expect(mock.calls).toHaveLength(0);
  });
});
