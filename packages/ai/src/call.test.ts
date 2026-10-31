import { hashStr } from '@swv/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { estimateTokens, MAX_PROMPT_TOKENS, REPLY_TOKENS } from './budgets.ts';
import { answerCacheInfo, clearAnswerCache, type AnswerKey } from './cache.ts';
import { callModel, TextReply, type ModelRequest } from './call.ts';
import { classifyStatus } from './client.ts';
import { loadModelState, saveModelState, type ModelEntry } from './models.ts';
import { presetFor } from './presets.ts';
import { mockFetch, mockModel, readStored, resetAiStorage, seedModels, type MockFetch, type MockReply } from './testing.ts';
import { loadUsage } from './usage.ts';

const GROQ = presetFor('groq').url;
const GEMINI = presetFor('gemini').url;
const MISTRAL = presetFor('mistral').url;

const ask = (patch: Partial<ModelRequest<string>> = {}): ModelRequest<string> => ({
  system: 'Be short.',
  prompt: 'Question: Why?',
  maxTokens: REPLY_TOKENS.ask,
  schema: TextReply,
  format: 'text',
  ...patch,
});

const KEY: AnswerKey = { flowVersion: 'v1', step: 1, question: 'Why?', mode: 'project' };

let mock: MockFetch | undefined;

/** Three models in order: Groq active, Gemini and Mistral marked as fallbacks. */
function threeModels(): ModelEntry[] {
  return seedModels(
    { preset: 'groq', name: 'Groq', key: 'key-groq' },
    { preset: 'gemini', name: 'Gemini', key: 'key-gemini', fallback: true },
    { preset: 'mistral', name: 'Mistral', key: 'key-mistral', fallback: true },
  );
}

/** Replies by host; a host not listed answers with its own name. */
function byHost(replies: Record<string, MockReply>): MockFetch {
  mock = mockFetch((url) => replies[url] ?? { reply: `answer from ${new URL(url).host}` });
  return mock;
}

beforeEach(async () => {
  resetAiStorage();
  await clearAnswerCache();
});

afterEach(() => {
  mock?.restore();
  mock = undefined;
  vi.useRealTimers();
});

describe('callModel: the reply', () => {
  it('returns validated text with the model that wrote it', async () => {
    const m = mockModel({ reply: '  The page starts the submit.  ' });
    mock = m;
    const result = await callModel(ask());
    expect(result).toMatchObject({
      ok: true,
      data: 'The page starts the submit.',
      cached: false,
      model: { id: m.entry.id, name: 'Groq', model: 'llama-3.3-70b-versatile' },
      notices: [],
    });
  });

  it('sends the system prompt, the prompt and the token budget', async () => {
    mock = mockModel({ reply: 'Fine.' });
    await callModel(ask());
    expect(mock.calls[0]?.body).toMatchObject({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 220,
      messages: [
        { role: 'system', content: 'Be short.' },
        { role: 'user', content: 'Question: Why?' },
      ],
    });
  });

  it('parses JSON replies against the schema, with or without code fences', async () => {
    const schema = z.object({ questions: z.array(z.object({ step: z.number() })) });
    for (const reply of [
      '{"questions":[{"step":3}]}',
      '```json\n{"questions":[{"step":3}]}\n```',
      'Here you go:\n{"questions":[{"step":3}]}\nGood luck!',
    ]) {
      mock = mockModel({ reply });
      const result = await callModel({ ...ask(), schema, format: 'json' });
      mock.restore();
      expect(result).toMatchObject({ ok: true, data: { questions: [{ step: 3 }] } });
    }
  });

  it.each([
    ['text that is not JSON', 'Sorry, I cannot do that.'],
    ['the wrong shape', '{"questions":"none"}'],
    ['broken JSON', '{"questions":['],
  ])('reports %s as a typed bad reply, without trying another model', async (_name, reply) => {
    const [groq] = threeModels();
    mock = mockFetch({ reply });
    const schema = z.object({ questions: z.array(z.string()) });
    const result = await callModel({ ...ask(), schema, format: 'json' });
    expect(result).toMatchObject({ ok: false, error: { kind: 'bad-reply', model: { id: groq?.id } } });
    expect(mock.calls).toHaveLength(1);
  });

  it.each([
    ['no choices', '{"choices":[]}'],
    ['an empty answer', '{"choices":[{"message":{"content":""}}]}'],
    ['a null answer', '{"choices":[{"message":{"content":null}}]}'],
    ['not JSON', '<html>gateway</html>'],
  ])('reports a provider reply with %s as a bad reply', async (_name, body) => {
    mock = mockModel({ body });
    const result = await callModel(ask());
    expect(result).toMatchObject({ ok: false, error: { kind: 'bad-reply', message: 'Groq sent no answer text.' } });
  });

  it('cuts a reply far over its budget, for a custom link that ignores max_tokens', async () => {
    mock = mockModel({ reply: 'x'.repeat(100_000) });
    const result = await callModel(ask());
    expect(result.ok && result.text.length).toBeLessThan(5000);
  });
});

describe('callModel: before anything is sent', () => {
  it('says no-model when nothing is set up', async () => {
    mock = mockFetch({});
    const result = await callModel(ask());
    expect(result).toMatchObject({ ok: false, error: { kind: 'no-model', message: 'No AI model set up yet.' } });
    expect(mock.calls).toHaveLength(0);
  });

  it('says no-model and names the model when the only one has no key', async () => {
    seedModels({ preset: 'groq', name: 'Groq', key: '' });
    mock = mockFetch({});
    const result = await callModel(ask());
    expect(result).toMatchObject({ ok: false, error: { kind: 'no-model' } });
    expect(!result.ok && result.error.message).toContain('Groq');
    expect(mock.calls).toHaveLength(0);
  });

  it('asks for the privacy notice first, naming every model that could receive the text', async () => {
    const [groq] = threeModels();
    localStorage.removeItem('swv:ai:consent');
    mock = mockFetch({});
    const result = await callModel(ask());
    expect(result).toMatchObject({ ok: false, error: { kind: 'consent-needed' } });
    expect(!result.ok && result.error.models?.map((m) => m.name)).toEqual(['Groq', 'Gemini', 'Mistral']);
    expect(!result.ok && result.error.message).toContain('api.groq.com');
    expect(groq).toBeDefined();
    expect(mock.calls).toHaveLength(0);
  });

  it('refuses a prompt over the budget', async () => {
    mockModel();
    mock = mockFetch({});
    const result = await callModel(ask({ prompt: 'x'.repeat((MAX_PROMPT_TOKENS + 1) * 4) }));
    expect(result).toMatchObject({ ok: false, error: { kind: 'prompt-too-large' } });
    expect(mock.calls).toHaveLength(0);
  });

  it('reports a cancelled request as aborted and sends nothing more', async () => {
    threeModels();
    mock = mockFetch({});
    const controller = new AbortController();
    controller.abort();
    const result = await callModel(ask({ signal: controller.signal }));
    expect(result).toMatchObject({ ok: false, error: { kind: 'aborted' } });
    expect(mock.calls).toHaveLength(0);
  });
});

describe('callModel: auto-switch (plan section 8.3)', () => {
  it('sends each key only to its own URL, confirmed from the calls', async () => {
    threeModels();
    byHost({
      [GROQ]: { status: 429 },
      [GEMINI]: { status: 500 },
    });
    const result = await callModel(ask());
    expect(result).toMatchObject({ ok: true, data: 'answer from api.mistral.ai' });
    expect(mock?.calls.map((c) => [c.url, c.authorization])).toEqual([
      [GROQ, 'Bearer key-groq'],
      [GEMINI, 'Bearer key-gemini'],
      [MISTRAL, 'Bearer key-mistral'],
    ]);
  });

  it('on a 429 retries once on the next model, and says what happened', async () => {
    threeModels();
    byHost({ [GROQ]: { status: 429 } });
    const result = await callModel(ask());
    expect(result).toMatchObject({
      ok: true,
      data: 'answer from generativelanguage.googleapis.com',
      model: { name: 'Gemini' },
      notices: ['Groq limit reached, switched to Gemini'],
    });
    expect(mock?.calls).toHaveLength(2);
  });

  it.each([
    ['a 402 from OpenRouter', 402, { error: { message: 'Insufficient credits' } }],
    ['a 403 budget error', 403, { error: { message: 'Budget exceeded' } }],
    ['a 400 quota error', 400, { error: { message: 'Quota exhausted for this project' } }],
  ])('treats %s as a limit', async (_name, status, body) => {
    threeModels();
    byHost({ [GROQ]: { status, body: JSON.stringify(body) } });
    const result = await callModel(ask());
    expect(result).toMatchObject({ ok: true, notices: ['Groq limit reached, switched to Gemini'] });
  });

  it.each([
    ['a 401', 401, '{"error":{"message":"Invalid API Key"}}', 'Invalid API Key'],
    ['Mistral\'s 401', 401, '{"detail":"Invalid API Key"}', 'Invalid API Key'],
    ['a 403', 403, '{"error":{"message":"Forbidden"}}', 'Forbidden'],
    [
      "Gemini's 400 with an array body",
      400,
      '[{"error":{"code":400,"message":"Please pass a valid API key","status":"INVALID_ARGUMENT"}}]',
      'Please pass a valid API key',
    ],
  ])('on a bad key (%s) does not switch, and shows the error on that model', async (_name, status, body, detail) => {
    const [groq] = threeModels();
    byHost({ [GROQ]: { status, body } });
    const result = await callModel(ask());
    expect(result).toMatchObject({ ok: false, error: { kind: 'bad-key', status, model: { id: groq?.id, name: 'Groq' } } });
    expect(!result.ok && result.error.message).toContain(detail);
    expect(mock?.calls).toHaveLength(1);
  });

  it('on a network error tries the next model once', async () => {
    threeModels();
    byHost({ [GROQ]: { networkError: true } });
    const result = await callModel(ask());
    expect(result).toMatchObject({ ok: true, model: { name: 'Gemini' }, notices: ['Could not reach Groq, switched to Gemini'] });
    expect(mock?.calls).toHaveLength(2);
  });

  it('on a server error tries the next model once', async () => {
    threeModels();
    byHost({ [GROQ]: { status: 503, body: 'overloaded' } });
    const result = await callModel(ask());
    expect(result).toMatchObject({ ok: true, notices: ['Groq had a server error, switched to Gemini'] });
  });

  it('on a request the provider refuses does not switch', async () => {
    threeModels();
    byHost({ [GROQ]: { status: 404, body: '{"error":{"message":"The model does not exist"}}' } });
    const result = await callModel(ask());
    expect(result).toMatchObject({ ok: false, error: { kind: 'bad-request', status: 404 } });
    expect(!result.ok && result.error.message).toContain('The model does not exist');
    expect(mock?.calls).toHaveLength(1);
  });

  it('never loops: every model is tried at most once for one request', async () => {
    threeModels();
    mock = mockFetch({ status: 500 });
    const result = await callModel(ask());
    expect(result.ok).toBe(false);
    expect(mock.calls.map((c) => c.url)).toEqual([GROQ, GEMINI, MISTRAL]);
  });

  it('uses only models marked as fallbacks', async () => {
    seedModels(
      { preset: 'groq', name: 'Groq', key: 'key-groq' },
      { preset: 'gemini', name: 'Gemini', key: 'key-gemini', fallback: false },
      { preset: 'mistral', name: 'Mistral', key: 'key-mistral', fallback: true },
    );
    mock = mockFetch({ status: 429 });
    await callModel(ask());
    expect(mock.calls.map((c) => c.url)).toEqual([GROQ, MISTRAL]);
  });

  it('with no fallback marked, a limit error stops at the one model', async () => {
    mock = mockModel({ status: 429 });
    const result = await callModel(ask());
    expect(result).toMatchObject({ ok: false, error: { kind: 'all-used-up' } });
    expect(mock.calls).toHaveLength(1);
  });

  it('the active model need not be marked as a fallback, and a later one still comes first when active', async () => {
    const [groq, gemini] = threeModels();
    saveModelState({ ...loadModelState(), activeId: gemini?.id ?? '' });
    mock = mockFetch({});
    const result = await callModel(ask());
    expect(result).toMatchObject({ ok: true, model: { name: 'Gemini' } });
    expect(mock.calls.map((c) => c.url)).toEqual([GEMINI]);
    expect(groq?.fallback).toBe(false);
  });

  it('when usage is low, the next question uses the next model, with a notice', async () => {
    const [groq] = threeModels();
    mock = mockFetch({
      headers: {
        'x-ratelimit-limit-requests': '100',
        'x-ratelimit-remaining-requests': '4',
        'x-ratelimit-reset-requests': '10m',
      },
    });
    await callModel(ask());
    expect(mock.calls.map((c) => c.url)).toEqual([GROQ]);
    expect(loadUsage()[groq?.id ?? '']?.windows[0]?.remaining).toBe(4);
    mock.restore();

    mock = mockFetch({});
    const result = await callModel(ask());
    expect(result).toMatchObject({ ok: true, model: { name: 'Gemini' }, notices: ['Groq is almost used up, switched to Gemini'] });
    expect(mock.calls.map((c) => c.url)).toEqual([GEMINI]);
  });

  it('honours an edited switch level', async () => {
    const [groq] = threeModels();
    saveModelState({ ...loadModelState(), switchAt: 50 });
    mock = mockFetch({
      headers: { 'x-ratelimit-limit-requests': '100', 'x-ratelimit-remaining-requests': '40', 'x-ratelimit-reset-requests': '10m' },
    });
    await callModel(ask());
    expect(mock.calls[0]?.url).toBe(GROQ);
    mock.restore();
    mock = mockFetch({});
    await callModel(ask());
    expect(mock.calls[0]?.url).toBe(GEMINI);
    expect(groq).toBeDefined();
  });

  it('keeps using a low model when there is nothing better', async () => {
    mock = mockModel({
      headers: { 'x-ratelimit-limit-requests': '100', 'x-ratelimit-remaining-requests': '2', 'x-ratelimit-reset-requests': '10m' },
    });
    await callModel(ask());
    const result = await callModel(ask());
    expect(result).toMatchObject({ ok: true, model: { name: 'Groq' }, notices: [] });
    expect(mock.calls).toHaveLength(2);
  });

  it('the first model returns after its reset', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 31, 12).getTime() });
    threeModels();
    byHost({ [GROQ]: { status: 429, headers: { 'retry-after': '30' } } });
    await callModel(ask());
    mock?.restore();

    byHost({});
    const during = await callModel(ask());
    expect(during).toMatchObject({ ok: true, model: { name: 'Gemini' }, notices: ['Groq limit reached, switched to Gemini'] });
    mock?.restore();

    vi.setSystemTime(new Date(2026, 9, 31, 12, 0, 31));
    byHost({});
    const after = await callModel(ask());
    expect(after).toMatchObject({ ok: true, model: { name: 'Groq' }, notices: [] });
  });

  it('when all are used up, says so with the earliest reset time, and sends nothing', async () => {
    const start = new Date(2026, 9, 31, 12).getTime();
    vi.useFakeTimers({ toFake: ['Date'], now: start });
    threeModels();
    mock = mockFetch((url) => ({ status: 429, headers: { 'retry-after': url === GEMINI ? '120' : '3600' } }));
    const first = await callModel(ask());
    expect(first).toMatchObject({ ok: false, error: { kind: 'all-used-up', resetAt: start + 120_000 } });
    expect(!first.ok && first.error.message).toBe('Every model has reached its limit. The earliest reset is at 12:02.');
    expect(mock.calls).toHaveLength(3);
    mock.restore();

    mock = mockFetch({});
    const again = await callModel(ask());
    expect(again).toMatchObject({ ok: false, error: { kind: 'all-used-up', resetAt: start + 120_000 } });
    expect(mock.calls).toHaveLength(0);
  });

  it('says plainly when no reset time is known', async () => {
    mock = mockModel({ status: 402 });
    const result = await callModel(ask());
    expect(result).toMatchObject({ ok: false, error: { kind: 'all-used-up' } });
    expect(!result.ok && result.error.message).toContain('The earliest reset is at');
  });

  it('reports the last failure when the models failed for other reasons', async () => {
    threeModels();
    mock = mockFetch((url) => (url === MISTRAL ? { status: 503 } : { status: 429 }));
    const result = await callModel(ask());
    expect(result).toMatchObject({ ok: false, error: { kind: 'server', model: { name: 'Mistral' } } });
    expect(!result.ok && result.notices).toEqual([
      'Groq limit reached, switched to Gemini',
      'Gemini limit reached, switched to Mistral',
    ]);
  });

  it('skips the active model when its key is gone, and says so', async () => {
    threeModels();
    const state = loadModelState();
    saveModelState({ ...state, models: state.models.map((m) => (m.name === 'Groq' ? { ...m, key: '' } : m)) });
    mock = mockFetch({});
    const result = await callModel(ask());
    expect(result).toMatchObject({ ok: true, model: { name: 'Gemini' }, notices: ['Groq is not set up, switched to Gemini'] });
  });
});

describe('callModel: answer cache (plan section 8.4)', () => {
  it('a repeated question costs 0 tokens and makes no network call', async () => {
    mock = mockModel({ reply: 'Because.' });
    expect(await callModel(ask({ cache: KEY }))).toMatchObject({ ok: true, cached: false });
    const again = await callModel(ask({ cache: { ...KEY, question: '  WHY  ?? ' } }));
    expect(again).toMatchObject({ ok: true, cached: true, tokens: 0, data: 'Because.', model: { name: 'Groq' } });
    expect(mock.calls).toHaveLength(1);
  });

  it('"Ask again" sends the request and replaces the saved answer', async () => {
    mock = mockFetch([{ reply: 'First.' }, { reply: 'Second.' }]);
    seedModels({ preset: 'groq', name: 'Groq' });
    await callModel(ask({ cache: KEY }));
    expect(await callModel(ask({ cache: KEY, fresh: true }))).toMatchObject({ ok: true, cached: false, data: 'Second.' });
    expect(await callModel(ask({ cache: KEY }))).toMatchObject({ ok: true, cached: true, data: 'Second.' });
    expect(mock.calls).toHaveLength(2);
  });

  it('a different model reuses the saved answer and shows which model wrote it', async () => {
    const [groq, gemini] = threeModels();
    mock = mockFetch({ reply: 'From Groq.' });
    await callModel(ask({ cache: KEY }));
    saveModelState({ ...loadModelState(), activeId: gemini?.id ?? '' });
    const result = await callModel(ask({ cache: KEY }));
    expect(result).toMatchObject({ ok: true, cached: true, data: 'From Groq.', model: { id: groq?.id, name: 'Groq' } });
    expect(mock.calls).toHaveLength(1);
  });

  it.each([
    ['flow version', { flowVersion: 'v2' }],
    ['step', { step: 2 }],
    ['question', { question: 'Why not?' }],
    ['answer mode', { mode: 'general' }],
  ])('a different %s is a different question', async (_name, change) => {
    mock = mockModel({ reply: 'Answer.' });
    await callModel(ask({ cache: KEY }));
    expect(await callModel(ask({ cache: { ...KEY, ...change } }))).toMatchObject({ ok: true, cached: false });
    expect(mock.calls).toHaveLength(2);
  });

  it('serves a saved answer with no model set up, because nothing is sent', async () => {
    mock = mockModel({ reply: 'Saved.' });
    await callModel(ask({ cache: KEY }));
    saveModelState({ ...loadModelState(), models: [] });
    expect(await callModel(ask({ cache: KEY }))).toMatchObject({ ok: true, cached: true, data: 'Saved.' });
  });

  it('without a key to cache under, nothing is saved', async () => {
    mock = mockModel({ reply: 'Answer.' });
    await callModel(ask());
    expect((await answerCacheInfo()).count).toBe(0);
    await callModel(ask());
    expect(mock.calls).toHaveLength(2);
  });

  it('does not save a failed or invalid reply', async () => {
    mock = mockModel({ reply: 'not json' });
    await callModel({ ...ask({ cache: KEY }), schema: z.object({ a: z.string() }), format: 'json' });
    expect((await answerCacheInfo()).count).toBe(0);
  });

  it('a saved answer that no longer passes the schema is asked again', async () => {
    mock = mockModel({ reply: 'plain text' });
    await callModel(ask({ cache: KEY }));
    mock.restore();
    mock = mockModel({ reply: '{"a":"b"}' });
    const result = await callModel({ ...ask({ cache: KEY }), schema: z.object({ a: z.string() }), format: 'json' });
    expect(result).toMatchObject({ ok: true, cached: false, data: { a: 'b' } });
  });

  it('reads an answer version 2 saved for the same prompt, by any provider', async () => {
    const prompt = 'Question: What is idempotency?';
    localStorage.setItem(
      'swv:ai:cache',
      JSON.stringify({ [hashStr(`gemini|${prompt}`)]: { a: 'The old answer.', t: 1700000000000 } }),
    );
    mock = mockFetch({});
    const result = await callModel(ask({ prompt, cache: { ...KEY, question: 'What is idempotency?' } }));
    expect(result).toMatchObject({ ok: true, cached: true, data: 'The old answer.', model: { name: 'Gemini' } });
    expect(mock.calls).toHaveLength(0);
  });

  it('never writes to the version 2 cache', async () => {
    mock = mockModel({ reply: 'New.' });
    await callModel(ask({ cache: KEY }));
    expect(localStorage.getItem('swv:ai:cache')).toBeNull();
  });
});

describe('callModel: usage accounting', () => {
  it('stores what the provider exposed, labelled by source', async () => {
    const m = mockModel({
      headers: { 'x-ratelimit-limit-requests': '1000', 'x-ratelimit-remaining-requests': '999', 'x-ratelimit-reset-requests': '1h' },
    });
    mock = m;
    await callModel(ask());
    expect(loadUsage()[m.entry.id]).toMatchObject({
      requests: 1,
      windows: [{ name: 'requests', limit: 1000, remaining: 999 }],
    });
  });

  it('counts requests and reported tokens when no headers can be read', async () => {
    const m = mockModel({
      body: JSON.stringify({ choices: [{ message: { content: 'Fine.' } }], usage: { total_tokens: 321 } }),
    });
    mock = m;
    await callModel(ask());
    await callModel(ask());
    expect(loadUsage()[m.entry.id]).toMatchObject({ requests: 2, tokens: 642, windows: [] });
  });

  it('estimates the tokens when the provider does not report them', async () => {
    const m = mockModel({ reply: 'Fine.' });
    mock = m;
    await callModel(ask());
    expect(loadUsage()[m.entry.id]?.tokens).toBe(estimateTokens(`Be short.Question: Why?Fine.`));
  });

  it('a saved answer is not counted', async () => {
    const m = mockModel({ reply: 'Fine.' });
    mock = m;
    await callModel(ask({ cache: KEY }));
    await callModel(ask({ cache: KEY }));
    expect(loadUsage()[m.entry.id]?.requests).toBe(1);
  });

  it('reads the OpenRouter key endpoint with that key, as an exact reading', async () => {
    const [entry] = seedModels({ preset: 'openrouter', name: 'OpenRouter', key: 'sk-or' });
    const keyUrl = 'https://openrouter.ai/api/v1/key';
    mock = mockFetch((url) =>
      url === keyUrl
        ? { body: JSON.stringify({ data: { limit: null, free_model_daily_requests: { used: 10, limit: 50, remaining: 40 } } }) }
        : { reply: 'Fine.' },
    );
    await callModel(ask());
    await vi.waitFor(() => {
      expect(loadUsage()[entry?.id ?? '']?.windows).toEqual([
        expect.objectContaining({ name: 'free requests per day', limit: 50, remaining: 40 }),
      ]);
    });
    expect(mock.calls.map((c) => [c.url, c.authorization])).toEqual([
      [presetFor('openrouter').url, 'Bearer sk-or'],
      [keyUrl, 'Bearer sk-or'],
    ]);
    expect(loadUsage()[entry?.id ?? '']?.requests).toBe(1);
  });

  it('reads a credit limit from the key endpoint', async () => {
    const [entry] = seedModels({ preset: 'openrouter', name: 'OpenRouter', key: 'sk-or' });
    mock = mockFetch((url) =>
      url.endsWith('/key') ? { body: JSON.stringify({ data: { limit: 10, limit_remaining: 2.5 } }) } : { reply: 'Fine.' },
    );
    await callModel(ask());
    await vi.waitFor(() => {
      expect(loadUsage()[entry?.id ?? '']?.windows).toEqual([
        { name: 'credits on this key', unit: 'credits', limit: 10, remaining: 2.5, resetAt: null },
      ]);
    });
  });

  it('falls back to the count when the key endpoint has nothing useful', async () => {
    const [entry] = seedModels({ preset: 'openrouter', name: 'OpenRouter', key: 'sk-or' });
    mock = mockFetch((url) => (url.endsWith('/key') ? { status: 401 } : { reply: 'Fine.' }));
    await callModel(ask());
    await vi.waitFor(() => {
      expect(mock?.calls).toHaveLength(2);
    });
    expect(loadUsage()[entry?.id ?? '']).toMatchObject({ requests: 1, windows: [] });
  });
});

describe('keys stay secret', () => {
  const SECRET = 'gsk_super_secret_value';

  it('hides a key that a provider echoes back in an error', async () => {
    seedModels({ preset: 'groq', name: 'Groq', key: SECRET });
    mock = mockFetch({ status: 401, body: JSON.stringify({ error: { message: `Bad key: ${SECRET}` } }) });
    const result = await callModel(ask());
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(!result.ok && result.error.message).toContain('[key hidden]');
  });

  it('never puts a key in the URL, the body, the cache or usage', async () => {
    seedModels({ preset: 'groq', name: 'Groq', key: SECRET });
    mock = mockFetch({ reply: 'Fine.' });
    await callModel(ask({ cache: KEY }));
    const call = mock.calls[0];
    expect(call?.url).not.toContain(SECRET);
    expect(JSON.stringify(call?.body)).not.toContain(SECRET);
    expect(call?.authorization).toBe(`Bearer ${SECRET}`);
    expect(JSON.stringify(readStored('swv:ai:usage'))).not.toContain(SECRET);
    const saved = await callModel(ask({ cache: KEY }));
    expect(JSON.stringify(saved)).not.toContain(SECRET);
  });

  it('asks fetch not to send cookies or follow redirects', async () => {
    seedModels({ preset: 'groq', name: 'Groq', key: SECRET });
    const fetchSpy = vi.fn((_url: string, _init: RequestInit) =>
      Promise.resolve(new Response('{"choices":[{"message":{"content":"Fine."}}]}')),
    );
    const original = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await callModel(ask());
    globalThis.fetch = original;
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ credentials: 'omit', redirect: 'error', cache: 'no-store' });
  });
});

describe('the Claude artifact host', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls the sampler with the prompts folded into one message, and counts the request', async () => {
    const sample = vi.fn(() => Promise.resolve({ text: 'From Claude.' }));
    vi.stubGlobal('claude', { use: vi.fn(() => Promise.resolve(sample)) });
    const [entry] = seedModels({ preset: 'claude', name: 'Claude', key: '' });
    mock = mockFetch({});
    const result = await callModel(ask());
    expect(result).toMatchObject({ ok: true, data: 'From Claude.', model: { name: 'Claude' } });
    expect(sample).toHaveBeenCalledWith([{ role: 'user', content: 'Be short.\n\nQuestion: Why?' }], { modelTier: 'quick', cache: false });
    expect(mock.calls).toHaveLength(0);
    expect(loadUsage()[entry?.id ?? '']?.requests).toBe(1);
  });

  it('is not used when the page is not an artifact', async () => {
    seedModels({ preset: 'claude', name: 'Claude', key: '' });
    const result = await callModel(ask());
    expect(result).toMatchObject({ ok: false, error: { kind: 'no-model' } });
  });
});

describe('classifyStatus', () => {
  it.each([
    [429, '', 'rate-limit'],
    [402, 'Insufficient credits', 'rate-limit'],
    [401, '', 'bad-key'],
    [403, 'PERMISSION_DENIED', 'bad-key'],
    [403, 'budget exceeded', 'rate-limit'],
    [400, 'Please pass a valid API key', 'bad-key'],
    [400, 'Missing or invalid Authorization header.', 'bad-key'],
    [400, 'Quota exceeded', 'rate-limit'],
    [400, 'messages: too short', 'bad-request'],
    [404, 'no such model', 'bad-request'],
    [413, 'Request too large', 'bad-request'],
    [500, '', 'server'],
    [503, '', 'server'],
    [529, '', 'server'],
  ])('%i %j is %s', (status, detail, kind) => {
    expect(classifyStatus(status, detail)).toBe(kind);
  });
});
