import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { testModel } from './check.ts';
import { newModel, type ModelEntry } from './models.ts';
import { mockFetch, resetAiStorage } from './testing.ts';
import { loadUsage } from './usage.ts';

const model = (patch: Partial<ModelEntry> = {}): ModelEntry => ({ ...newModel('groq'), key: 'groq-key', ...patch });

/** A browser that refuses the real call. The no-cors probe still gets through when `up`. */
function blockCalls(up: boolean) {
  const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
    up && init?.mode === 'no-cors'
      ? Promise.resolve(new Response(null))
      : Promise.reject(new TypeError('Failed to fetch')),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(resetAiStorage);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('testModel', () => {
  it('sends a tiny fixed question to this model only, with its own key', async () => {
    const mock = mockFetch({ reply: 'OK' });
    const check = await testModel(model());
    mock.restore();
    expect(check.ok).toBe(true);
    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0]?.url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(mock.calls[0]?.authorization).toBe('Bearer groq-key');
    expect(mock.calls[0]?.body.max_tokens).toBe(8);
    expect(JSON.stringify(mock.calls[0]?.body.messages)).not.toContain('data, not instructions');
  });

  it('says the model works, and that usage is counted here when no limits can be read', async () => {
    const mock = mockFetch({ reply: 'OK' });
    const entry = model();
    const check = await testModel(entry);
    mock.restore();
    expect(check.message).toContain('Works. Groq said: OK.');
    expect(check.message).toContain('usage is counted in this browser');
    expect(loadUsage()[entry.id]?.requests).toBe(1);
  });

  it('says usage is exact when the limits can be read', async () => {
    const mock = mockFetch({
      reply: 'OK',
      headers: {
        'x-ratelimit-limit-requests': '100',
        'x-ratelimit-remaining-requests': '90',
        'x-ratelimit-reset-requests': '2m',
      },
    });
    const entry = model();
    const check = await testModel(entry);
    mock.restore();
    expect(check.message).toContain('Usage is exact');
    expect(loadUsage()[entry.id]?.windows[0]).toMatchObject({ limit: 100, remaining: 90 });
  });

  it('names what is missing without sending anything', async () => {
    const mock = mockFetch({ reply: 'OK' });
    const check = await testModel(model({ key: '' }));
    mock.restore();
    expect(check).toEqual({ ok: false, message: 'Add the API key for Groq.' });
    expect(mock.calls).toHaveLength(0);
  });

  it('refuses a plain http link off this computer without sending anything', async () => {
    const mock = mockFetch({ reply: 'OK' });
    const check = await testModel(model({ preset: 'custom', url: 'http://evil.example/v1/chat/completions' }));
    mock.restore();
    expect(check.ok).toBe(false);
    expect(check.message).toMatch(/https/);
    expect(mock.calls).toHaveLength(0);
  });

  it('reports a bad key on that model', async () => {
    const mock = mockFetch({ status: 401, body: JSON.stringify({ error: { message: 'Invalid API Key' } }) });
    const check = await testModel(model());
    mock.restore();
    expect(check.ok).toBe(false);
    expect(check.message).toBe('Groq rejected the API key (401): Invalid API Key. Check the key in AI settings.');
  });

  it('reports a limit error', async () => {
    const mock = mockFetch({ status: 429, body: JSON.stringify({ error: { message: 'Rate limit reached' } }) });
    const check = await testModel(model());
    mock.restore();
    expect(check.ok).toBe(false);
    expect(check.message).toContain('Groq limit reached (429)');
  });

  it('explains a call the browser blocked, when the host itself answers', async () => {
    const fetchMock = blockCalls(true);
    const check = await testModel(model());
    expect(check.ok).toBe(false);
    expect(check.message).toContain('Your browser blocked the reply from api.groq.com.');
    expect(check.message).toContain('does not allow calls from web pages');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never sends the key or any text with the probe', async () => {
    const fetchMock = blockCalls(true);
    await testModel(model());
    const probe = fetchMock.mock.calls[1]?.[1];
    expect(probe?.mode).toBe('no-cors');
    expect(probe?.headers).toBeUndefined();
    expect(probe?.body).toBeUndefined();
    expect(probe?.credentials).toBe('omit');
  });

  it('says that Cerebras hides a wrong key, because its error reply carries no CORS header', async () => {
    blockCalls(true);
    const check = await testModel(model({ ...newModel('cerebras'), key: 'k' }));
    expect(check.message).toContain('Cerebras hides a wrong key from browsers, so check the key first.');
  });

  it('tells apart a host that does not answer', async () => {
    blockCalls(false);
    const check = await testModel(model());
    expect(check.message).toBe('Nothing answered at api.groq.com. Check the address and your connection.');
  });

  it('asks whether a local model is running', async () => {
    blockCalls(false);
    const check = await testModel(model({ ...newModel('ollama'), key: '' }));
    expect(check.message).toBe('Nothing answered at localhost:11434. Is it running on this computer?');
  });

  it('gives Ollama its own setting when it refuses this page', async () => {
    blockCalls(true);
    const check = await testModel(model({ ...newModel('ollama'), key: '' }));
    expect(check.message).toContain('Start it with OLLAMA_ORIGINS=');
    expect(check.message).toContain(location.origin);
  });

  it('says when the browser is offline', async () => {
    blockCalls(false);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const check = await testModel(model());
    expect(check.message).toBe('This browser is offline.');
  });

  it('reads the OpenRouter key endpoint for an exact reading', async () => {
    const mock = mockFetch((url) =>
      url.endsWith('/key')
        ? { body: JSON.stringify({ data: { free_model_daily_requests: { used: 1, limit: 50, remaining: 49 } } }) }
        : { reply: 'OK' },
    );
    const entry = model({ ...newModel('openrouter'), key: 'or-key' });
    const check = await testModel(entry);
    mock.restore();
    expect(check.message).toContain('Usage is exact');
    expect(mock.calls.map((c) => c.authorization)).toEqual(['Bearer or-key', 'Bearer or-key']);
    expect(loadUsage()[entry.id]?.windows[0]).toMatchObject({ limit: 50, remaining: 49 });
  });
});
