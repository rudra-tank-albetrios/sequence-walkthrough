import { afterEach, describe, expect, it, vi } from 'vitest';

import { chooseModel, detectModelLink, listModelNames } from './detect.ts';
import { newModel } from './models.ts';

describe('detectModelLink', () => {
  it.each([
    ['https://api.groq.com/openai/v1/chat/completions', 'groq'],
    ['console.groq.com/keys', 'groq'],
    ['https://aistudio.google.com/apikey', 'gemini'],
    ['https://api.mistral.ai/v1', 'mistral'],
    ['localhost:11434', 'ollama'],
  ])('knows the provider of %s', (link, preset) => {
    expect(detectModelLink(link)).toMatchObject({ ok: true, preset, url: '' });
  });

  it('reads the model out of the link', () => {
    expect(detectModelLink('https://openrouter.ai/meta-llama/llama-3:free')).toMatchObject({
      preset: 'openrouter',
      model: 'meta-llama/llama-3:free',
      named: true,
    });
    expect(
      detectModelLink('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent'),
    ).toMatchObject({ preset: 'gemini', model: 'gemini-2.5-pro' });
    expect(detectModelLink('https://console.groq.com/playground?model=qwen-3')).toMatchObject({ model: 'qwen-3' });
    expect(detectModelLink('https://huggingface.co/org/some-model')).toMatchObject({
      preset: 'custom',
      url: 'https://router.huggingface.co/v1/chat/completions',
      model: 'org/some-model',
    });
  });

  it('turns any other server into its chat address', () => {
    expect(detectModelLink('https://api.deepseek.com')).toMatchObject({
      preset: 'custom',
      name: 'Deepseek',
      url: 'https://api.deepseek.com/v1/chat/completions',
      model: '',
    });
    expect(detectModelLink('https://my.proxy.dev/llm/v1/models/mine')).toMatchObject({
      url: 'https://my.proxy.dev/llm/v1/chat/completions',
      model: 'mine',
    });
  });

  it('refuses a key in the link and plain http to another computer', () => {
    expect(detectModelLink('https://x.dev/v1?api_key=abc').ok).toBe(false);
    expect(detectModelLink('http://x.dev/v1').ok).toBe(false);
    expect(detectModelLink('  ').ok).toBe(false);
  });
});

describe('chooseModel', () => {
  it('keeps the current model, then prefers a free one', () => {
    expect(chooseModel(['a', 'b'], 'b')).toBe('b');
    expect(chooseModel(['paid', 'x:free'], 'gone')).toBe('x:free');
    expect(chooseModel(['paid'], 'gone')).toBe('paid');
    expect(chooseModel([], 'gone')).toBe('gone');
  });
});

describe('listModelNames', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks only the entry’s own server and leaves out models that cannot chat', async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(Response.json({ data: [{ id: 'models/chat-1' }, { id: 'text-embedding-3' }] })),
    );
    vi.stubGlobal('fetch', fetcher);
    const entry = { ...newModel('custom'), url: 'https://my.dev/v1/chat/completions', key: 'k' };
    await expect(listModelNames(entry)).resolves.toEqual(['chat-1']);
    expect(fetcher).toHaveBeenCalledWith(
      'https://my.dev/v1/models',
      expect.objectContaining({ redirect: 'error', headers: { Authorization: 'Bearer k' } }),
    );
  });

  it('gives null when the server will not say', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('blocked')));
    await expect(listModelNames(newModel('groq'))).resolves.toBeNull();
  });
});
