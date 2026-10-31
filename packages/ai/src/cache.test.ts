import { beforeEach, describe, expect, it } from 'vitest';

import {
  answerCacheInfo,
  clearAnswerCache,
  normaliseQuestion,
  readAnswer,
  writeAnswer,
  type AnswerKey,
  type SavedAnswer,
} from './cache.ts';
import { resetAiStorage } from './testing.ts';

const key = (question: string): AnswerKey => ({ flowVersion: 'v1', step: 1, question, mode: 'project' });

const answer = (text: string, savedAt = 1000): SavedAnswer => ({
  text,
  modelId: 'm1',
  modelName: 'Groq',
  model: 'llama',
  savedAt,
});

beforeEach(async () => {
  resetAiStorage();
  await clearAnswerCache();
});

describe('normaliseQuestion', () => {
  it.each([
    ['  Why THIS step?? ', 'why this step'],
    ['What   is\n a hold?', 'what is a hold'],
    ['Done.', 'done'],
    ['Ｗｈｙ', 'why'],
  ])('%j reads as %j', (input, output) => {
    expect(normaliseQuestion(input)).toBe(output);
  });
});

describe('the answer cache', () => {
  it('finds an answer under the same key, however the question is typed', async () => {
    await writeAnswer(key('Why?'), answer('Because.'));
    expect(await readAnswer(key(' why '), '')).toMatchObject({ text: 'Because.', modelName: 'Groq' });
    expect(await readAnswer(key('How?'), '')).toBeNull();
  });

  it('keeps the newest 500 and drops the oldest', async () => {
    for (let i = 0; i < 503; i++) await writeAnswer(key(`Question ${i}`), answer(`Answer ${i}`, i));
    expect((await answerCacheInfo()).count).toBe(500);
    expect(await readAnswer(key('Question 0'), '')).toBeNull();
    expect(await readAnswer(key('Question 2'), '')).toBeNull();
    expect(await readAnswer(key('Question 3'), '')).toMatchObject({ text: 'Answer 3' });
    expect(await readAnswer(key('Question 502'), '')).toMatchObject({ text: 'Answer 502' });
  });

  it('reports its size, and counts version 2 answers too', async () => {
    expect(await answerCacheInfo()).toEqual({ count: 0, bytes: 0 });
    await writeAnswer(key('Why?'), answer('Because.'));
    localStorage.setItem('swv:ai:cache', JSON.stringify({ abc: { a: 'Old.', t: 1 } }));
    const info = await answerCacheInfo();
    expect(info.count).toBe(2);
    expect(info.bytes).toBeGreaterThan(50);
  });

  it('clears everything, version 2 answers too', async () => {
    await writeAnswer(key('Why?'), answer('Because.'));
    localStorage.setItem('swv:ai:cache', JSON.stringify({ abc: { a: 'Old.', t: 1 } }));
    await clearAnswerCache();
    expect(await answerCacheInfo()).toEqual({ count: 0, bytes: 0 });
    expect(localStorage.getItem('swv:ai:cache')).toBeNull();
  });

  it('holds no key and no prompt: only the text and who wrote it', async () => {
    await writeAnswer(key('Why?'), answer('Because.'));
    expect(Object.keys((await readAnswer(key('Why?'), '')) ?? {}).sort()).toEqual([
      'model',
      'modelId',
      'modelName',
      'savedAt',
      'text',
    ]);
  });
});
