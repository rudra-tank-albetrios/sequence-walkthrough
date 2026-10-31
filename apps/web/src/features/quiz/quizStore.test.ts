import { mockFetch, mockModel, resetAiStorage, seedModels, type MockFetch } from '@swv/ai/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_DIAGRAM } from '../../shared/lib/defaultDiagram.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { flowId } from '../../shared/storage/notes.ts';
import {
  clearWeakPoints,
  loadWeakPoints,
  QUIZ_RETRY_KEY,
  requestQuizRetry,
} from '../../shared/storage/weakPoints.ts';
import { useQuizStore } from './quizStore.ts';
import { forgetRecentQuestions } from './recent.ts';
import { goodItems, quizReply } from './testReplies.ts';
import { DEFAULT_CONFIG, type QuizConfig } from './types.ts';

const config = (patch: Partial<QuizConfig> = {}): QuizConfig => ({ ...DEFAULT_CONFIG, ...patch });
const store = () => useQuizStore.getState();

let mock: MockFetch | null = null;

/** Lets the writes to browser storage that were started finish. */
const settled = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 20));
};

beforeEach(async () => {
  resetAiStorage();
  sessionStorage.clear();
  await clearWeakPoints();
  useFlowStore.getState().setCode(DEFAULT_DIAGRAM);
  // Each test is the first quiz on this flow: nothing is "recent" from an earlier one.
  const { flow } = useFlowStore.getState();
  if (flow) await forgetRecentQuestions(flowId(flow));
  store().leave();
  store().dropRetry();
  useFlowStore.getState().setUi({ quizOpen: false, aiSettingsOpen: false });
});

afterEach(() => {
  mock?.restore();
  mock = null;
  resetAiStorage();
});

describe('a quiz from the built-in sample', () => {
  it('runs with no model and makes no request', async () => {
    mock = mockFetch({ reply: 'unused' });
    await store().start(config(), 'sample');
    expect(store().phase).toBe('running');
    expect(store().questions).toHaveLength(5);
    store().submit();
    expect(store().phase).toBe('result');
    await settled();
    expect(store().marking).toBe('idle');
    expect(mock.calls).toHaveLength(0);
    for (const question of store().questions) expect(store().marks[question.id]?.by).toBe('browser');
  });

  it('asks the topics of "Retry my mistakes" and clears the hand-over', async () => {
    requestQuizRetry({ topics: ['Status codes'], flowId: null });
    store().prepare();
    expect(store().retry?.topics).toEqual(['Status codes']);
    expect(sessionStorage.getItem(QUIZ_RETRY_KEY)).toBeNull();
    await store().start(config({ difficulty: 'all', focus: ['Status codes'] }), 'sample');
    expect(store().questions.length).toBeGreaterThan(0);
    expect(store().questions.every((question) => question.topic === 'Status codes')).toBe(true);
    expect(store().retry).toBeNull();
  });

  it('starts again when the flow on screen has changed', async () => {
    await store().start(config(), 'sample');
    store().submit();
    useFlowStore.getState().setCode(`${DEFAULT_DIAGRAM}\n`);
    store().prepare();
    expect(store().phase).toBe('setup');
    expect(store().questions).toEqual([]);
  });

  it('keeps a result when the flow has not changed', async () => {
    await store().start(config(), 'sample');
    store().submit();
    store().prepare();
    expect(store().phase).toBe('result');
  });
});

describe('submitting', () => {
  it('submits once: the button and the timer together count one result', async () => {
    await store().start(config({ type: 'choice' }), 'sample');
    store().submit();
    const finishedAt = store().finishedAt;
    await new Promise((resolve) => setTimeout(resolve, 5));
    store().submit(true);
    store().submit();
    expect(store().finishedAt).toBe(finishedAt);
    expect(store().autoSubmitted).toBe(false);
    await settled();
    const points = await loadWeakPoints();
    expect(points).toHaveLength(5);
    expect(points.every((point) => point.timesMissed === 1)).toBe(true);
  });

  it('notes when the timer submitted', async () => {
    await store().start(config({ time: { kind: 'timer', minutes: 1 } }), 'sample');
    store().submit(true);
    expect(store().phase).toBe('result');
    expect(store().autoSubmitted).toBe(true);
  });

  it('does not change answers after the end', async () => {
    await store().start(config(), 'sample');
    const id = store().questions[0]?.id ?? '';
    store().answer(id, 'first');
    store().submit();
    store().answer(id, 'second');
    expect(store().answers[id]).toBe('first');
  });

  it('does nothing before a quiz runs', () => {
    store().submit();
    expect(store().phase).toBe('setup');
  });
});

describe('weak points', () => {
  it('saves what was missed, with its step and chapter, and why', async () => {
    await store().start(config({ type: 'choice' }), 'sample');
    store().submit();
    await settled();
    const points = await loadWeakPoints();
    expect(points).toHaveLength(5);
    const asked = store().questions[0];
    const point = points.find((candidate) => candidate.question === asked?.text);
    expect(point?.correctAnswer).toBe(asked?.answer);
    expect(point?.whyWrong).toBe(asked?.why);
    expect(point?.step).toBeGreaterThan(0);
    expect(point?.flow).toBe(store().flow?.title);
    expect(point?.chapter).toBeTruthy();
    expect(point?.userAnswer).toBe('');
  });

  it('lowers the count when the same question is answered correctly later', async () => {
    await store().start(config({ type: 'choice' }), 'sample');
    store().submit();
    await settled();
    const missed = store().questions.map((question) => question.text);
    expect(await loadWeakPoints()).toHaveLength(5);
    // New runs, with every question answered correctly.
    for (let run = 0; run < 12 && (await loadWeakPoints()).length > 0; run++) {
      store().backToSetup();
      await store().start(config({ type: 'choice' }), 'sample');
      for (const question of store().questions) store().answer(question.id, question.answer);
      store().submit();
      await settled();
    }
    const left = await loadWeakPoints();
    expect(left.filter((point) => missed.includes(point.question))).toEqual([]);
  });
});

describe('Mark as correct', () => {
  const written = async (): Promise<string> => {
    await store().start(config({ type: 'line' }), 'sample');
    const id = store().questions[0]?.id ?? '';
    store().submit();
    await settled();
    return id;
  };

  it('changes the mark, says who did, and takes the miss back', async () => {
    const id = await written();
    expect(store().marks[id]?.value).toBe('wrong');
    const before = await loadWeakPoints();
    store().markAsCorrect(id);
    await settled();
    expect(store().marks[id]).toEqual({ value: 'correct', by: 'user', feedback: '' });
    expect(await loadWeakPoints()).toHaveLength(before.length - 1);
  });

  it('counts once, however many times it is pressed', async () => {
    const id = await written();
    const before = await loadWeakPoints();
    store().markAsCorrect(id);
    store().markAsCorrect(id);
    await settled();
    expect(await loadWeakPoints()).toHaveLength(before.length - 1);
  });

  it('is only for written answers', async () => {
    await store().start(config({ type: 'choice' }), 'sample');
    const id = store().questions[0]?.id ?? '';
    store().submit();
    store().markAsCorrect(id);
    expect(store().marks[id]?.value).toBe('wrong');
  });
});

describe('a quiz from a model', () => {
  const marking = (mark: string) =>
    JSON.stringify({
      marks: [1, 2, 3, 4, 5].map((id) => ({ id, mark, why: 'Half of it.' })),
    });

  it('sends the written answers once, in one batch, and labels the marks', async () => {
    seedModels({});
    mock = mockFetch([{ reply: quizReply(goodItems({ type: 'line' })) }, { reply: marking('partly') }]);
    await store().start(config({ type: 'line' }), 'model');
    expect(store().phase).toBe('running');
    for (const question of store().questions) store().answer(question.id, 'Something typed');
    store().submit();
    expect(store().marking).toBe('busy');
    await settled();
    expect(mock.calls).toHaveLength(2);
    expect(mock.calls[1]?.body.max_tokens).toBe(400);
    expect(store().marking).toBe('idle');
    for (const question of store().questions) {
      expect(store().marks[question.id]).toEqual({ value: 'partly', by: 'ai', feedback: 'Half of it.' });
    }
    expect((await loadWeakPoints())[0]?.whyWrong).toBe('Half of it.');
  });

  it('never sends a blank written answer to be marked', async () => {
    mock = mockModel({ reply: quizReply(goodItems({ type: 'line' })) });
    await store().start(config({ type: 'line' }), 'model');
    store().submit();
    await settled();
    expect(mock.calls).toHaveLength(1);
    expect(store().marking).toBe('idle');
  });

  it('shows the result at once and can mark again after a bad reply', async () => {
    seedModels({});
    mock = mockFetch([
      { reply: quizReply(goodItems({ type: 'line' })) },
      { reply: 'I would rather not.' },
      { reply: marking('correct') },
    ]);
    await store().start(config({ type: 'line' }), 'model');
    for (const question of store().questions) store().answer(question.id, 'Something typed');
    store().submit();
    expect(store().phase).toBe('result');
    await settled();
    expect(store().marking).toBe('failed');
    expect(store().markingProblem).toBeTruthy();
    expect(await loadWeakPoints()).toEqual([]);
    store().retryMarking();
    await settled();
    expect(store().marking).toBe('idle');
    expect(store().marks[store().questions[0]?.id ?? '']?.value).toBe('correct');
  });

  it('a mark from the model does not overwrite "Mark as correct"', async () => {
    seedModels({});
    mock = mockFetch([{ reply: quizReply(goodItems({ type: 'line' })) }, { reply: marking('wrong') }]);
    await store().start(config({ type: 'line' }), 'model');
    const first = store().questions[0]?.id ?? '';
    for (const question of store().questions) store().answer(question.id, 'Something typed');
    store().submit();
    store().markAsCorrect(first);
    await settled();
    expect(store().marks[first]).toEqual({ value: 'correct', by: 'user', feedback: '' });
  });

  it('opens AI settings when no model is set up', async () => {
    await store().start(config(), 'model');
    expect(store().phase).toBe('setup');
    expect(store().notice).toBeTruthy();
    expect(useFlowStore.getState().ui.aiSettingsOpen).toBe(true);
  });

  it('shows a clear error after a bad reply and its retry', async () => {
    mock = mockModel({ reply: 'not a quiz' });
    await store().start(config(), 'model');
    expect(store().phase).toBe('error');
    expect(store().error).toContain('even after one retry');
    expect(mock.calls).toHaveLength(2);
  });
});
