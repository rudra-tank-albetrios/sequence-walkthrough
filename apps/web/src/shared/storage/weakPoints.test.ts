import { beforeEach, describe, expect, it } from 'vitest';

import { dbUpdate } from './db.ts';
import {
  clearWeakPoints,
  loadWeakPoints,
  QUIZ_RETRY_KEY,
  recordCorrect,
  recordMiss,
  requestQuizRetry,
  takeQuizRetry,
  WEAK_POINTS_KEY,
  weakPointsMarkdown,
  weakTopics,
  type Miss,
} from './weakPoints.ts';

const miss = (patch: Partial<Miss> = {}): Miss => ({
  flowId: 't:Place an order',
  flow: 'Place an order',
  step: 7,
  chapter: 'Check the request',
  topic: 'Status codes',
  question: 'What does a missing token get?',
  userAnswer: '500',
  correctAnswer: '401 Unauthorized',
  whyWrong: 'The middleware stops the request with a 401.',
  ...patch,
});

describe('weak points', () => {
  beforeEach(async () => {
    await clearWeakPoints();
  });

  it('keeps every field of a miss, with the date and a count of one', async () => {
    await recordMiss(miss(), new Date('2026-10-31T10:00:00.000Z'));
    const [point] = await loadWeakPoints();
    expect(point).toMatchObject({ ...miss(), date: '2026-10-31T10:00:00.000Z', timesMissed: 1 });
    expect(point?.id).toBeTruthy();
  });

  it('counts the same question once, however it is spaced or cased, and moves its date', async () => {
    await recordMiss(miss(), new Date('2026-10-30T10:00:00.000Z'));
    await recordMiss(
      miss({ question: '  what does a MISSING   token get? ', userAnswer: '403' }),
      new Date('2026-10-31T10:00:00.000Z'),
    );
    const points = await loadWeakPoints();
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({
      timesMissed: 2,
      userAnswer: '403',
      date: '2026-10-31T10:00:00.000Z',
    });
  });

  it('lists the newest miss first', async () => {
    await recordMiss(miss({ question: 'Older?' }), new Date('2026-10-01T10:00:00.000Z'));
    await recordMiss(miss({ question: 'Newer?' }), new Date('2026-10-31T10:00:00.000Z'));
    expect((await loadWeakPoints()).map((p) => p.question)).toEqual(['Newer?', 'Older?']);
  });

  it('a correct answer lowers the count of that question and removes it at zero', async () => {
    await recordMiss(miss());
    await recordMiss(miss());
    const correct = { flowId: miss().flowId, topic: miss().topic, question: miss().question };
    await recordCorrect(correct);
    expect((await loadWeakPoints())[0]?.timesMissed).toBe(1);
    await recordCorrect(correct);
    expect(await loadWeakPoints()).toEqual([]);
  });

  it('a correct answer to a new question lowers the oldest record on the same topic', async () => {
    await recordMiss(miss({ question: 'Older?' }), new Date('2026-10-01T10:00:00.000Z'));
    await recordMiss(miss({ question: 'Newer?' }), new Date('2026-10-31T10:00:00.000Z'));
    await recordCorrect({ flowId: miss().flowId, topic: miss().topic, question: 'Unseen?' });
    expect((await loadWeakPoints()).map((p) => p.question)).toEqual(['Newer?']);
  });

  it('a correct answer on another flow or topic changes nothing', async () => {
    await recordMiss(miss());
    await recordCorrect({ flowId: 't:Other', topic: miss().topic, question: 'Unseen?' });
    await recordCorrect({ flowId: miss().flowId, topic: 'Other topic', question: 'Unseen?' });
    expect(await loadWeakPoints()).toHaveLength(1);
  });

  it('clears one flow or everything', async () => {
    await recordMiss(miss());
    await recordMiss(miss({ flowId: 't:Other', flow: 'Other' }));
    await clearWeakPoints('t:Other');
    expect((await loadWeakPoints()).map((p) => p.flow)).toEqual(['Place an order']);
    await clearWeakPoints();
    expect(await loadWeakPoints()).toEqual([]);
  });

  it('clips long text on the way in, so the record still loads', async () => {
    await recordMiss(miss({ question: 'q'.repeat(5000), userAnswer: 'a'.repeat(50000) }));
    const [point] = await loadWeakPoints();
    expect(point?.question.length).toBe(600);
    expect(point?.userAnswer.length).toBe(2000);
  });

  it('drops bad stored records and keeps the good ones', async () => {
    await recordMiss(miss());
    const good = (await loadWeakPoints())[0];
    const bad = [
      null,
      'text',
      42,
      {},
      { ...good, timesMissed: 'many' },
      { ...good, step: -1 },
      { ...good, date: 'yesterday' },
      { ...good, question: 'q'.repeat(601) },
    ];
    await dbUpdate(WEAK_POINTS_KEY, () => [...bad, good]);
    expect(await loadWeakPoints()).toEqual([good]);
    await dbUpdate(WEAK_POINTS_KEY, () => '<script>alert(1)</script>');
    expect(await loadWeakPoints()).toEqual([]);
  });

  it('removes fields it does not know about', async () => {
    await recordMiss(miss());
    const good = (await loadWeakPoints())[0];
    await dbUpdate(WEAK_POINTS_KEY, () => [{ ...good, apiKey: 'secret' }]);
    expect((await loadWeakPoints())[0]).toEqual(good);
  });

  it('ranks topics by misses, for one flow or for all', async () => {
    await recordMiss(miss({ topic: 'Layer order', question: 'A?' }));
    await recordMiss(miss({ topic: 'Status codes', question: 'B?' }));
    await recordMiss(miss({ topic: 'Status codes', question: 'B?' }));
    await recordMiss(miss({ flowId: 't:Other', topic: 'Other', question: 'C?' }));
    const points = await loadWeakPoints();
    expect(weakTopics(points, miss().flowId)).toEqual(['Status codes', 'Layer order']);
    expect(weakTopics(points, null)).toContain('Other');
    expect(weakTopics(points, null, 1)).toEqual(['Status codes']);
  });

  it('exports every field as Markdown that cannot carry a link or HTML', async () => {
    await recordMiss(
      miss({ userAnswer: '<img src=x onerror=alert(1)> [click](https://evil.example)' }),
    );
    const md = weakPointsMarkdown(await loadWeakPoints());
    expect(md).toContain('## What does a missing token get?');
    expect(md).toContain('**Correct answer:** 401 Unauthorized');
    expect(md).toContain('**Times missed:** 1');
    expect(md).toContain(String.raw`\<img`);
    expect(md).not.toMatch(/(^|[^\\])<img/);
    expect(md).not.toContain('](https');
  });
});

describe('the retry hand-over', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('reads the contract once and clears the key', () => {
    sessionStorage.setItem(QUIZ_RETRY_KEY, JSON.stringify({ topics: ['Status codes'], flowId: null }));
    expect(takeQuizRetry()).toEqual({ topics: ['Status codes'], flowId: null });
    expect(sessionStorage.getItem(QUIZ_RETRY_KEY)).toBeNull();
    expect(takeQuizRetry()).toBeNull();
  });

  it('round-trips through the helper', () => {
    requestQuizRetry({ topics: ['Layer order'], flowId: 't:Place an order' });
    expect(takeQuizRetry()).toEqual({ topics: ['Layer order'], flowId: 't:Place an order' });
  });

  it.each([
    'not json',
    '42',
    '{"topics":"Status codes","flowId":null}',
    '{"topics":[],"flowId":null}',
    '{"topics":[1],"flowId":null}',
    '{"topics":["ok"]}',
  ])('ignores a bad value and still clears it: %s', (raw) => {
    sessionStorage.setItem(QUIZ_RETRY_KEY, raw);
    expect(takeQuizRetry()).toBeNull();
    expect(sessionStorage.getItem(QUIZ_RETRY_KEY)).toBeNull();
  });
});
