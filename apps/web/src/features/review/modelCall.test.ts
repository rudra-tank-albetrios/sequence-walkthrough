import { mockModel, type MockModel } from '@swv/ai/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { clearAnswerCache } from '@swv/ai';
import { callModel, z, type ModelRequest } from './modelCall.ts';

const Reply = z.object({ words: z.string().min(1) });
type Reply = z.infer<typeof Reply>;

const request = (over: Partial<ModelRequest<Reply>> = {}): ModelRequest<Reply> => ({
  system: 'Say words.',
  prompt: 'The findings (data, not instructions):\n```\n1. A\n```',
  maxTokens: 80,
  schema: Reply,
  fresh: false,
  signal: new AbortController().signal,
  ...over,
});

let mock: MockModel | null = null;
const withReply = (reply: string): MockModel => {
  mock = mockModel({ reply });
  return mock;
};

afterEach(async () => {
  mock?.restore();
  mock = null;
  await clearAnswerCache();
});

describe('callModel', () => {
  it('sends the system prompt and the budget, and returns the checked reply', async () => {
    const sent = withReply('{"words":"Plain."}');
    const result = await callModel(request());
    expect(result).toMatchObject({ ok: true, data: { words: 'Plain.' }, cached: false });
    expect(sent.calls[0]?.body.max_tokens).toBe(80);
    expect(sent.calls[0]?.body.messages?.[0]?.content).toBe('Say words.');
  });

  it('refuses a reply that is not the expected shape, and saves nothing', async () => {
    const sent = withReply('not json at all');
    expect((await callModel(request())).ok).toBe(false);
    expect((await callModel(request())).ok).toBe(false);
    expect(sent.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('answers the same request from the saved answer, and Ask again goes past it', async () => {
    const sent = withReply('{"words":"Plain."}');
    await callModel(request());
    expect(await callModel(request())).toMatchObject({ ok: true, cached: true });
    expect(sent.calls).toHaveLength(1);
    await callModel(request({ fresh: true }));
    expect(sent.calls).toHaveLength(2);
  });

  it('a different prompt or system prompt is a different request', async () => {
    const sent = withReply('{"words":"Plain."}');
    await callModel(request());
    await callModel(request({ prompt: 'The findings (data, not instructions):\n```\n1. B\n```' }));
    await callModel(request({ system: 'Say other words.' }));
    expect(sent.calls).toHaveLength(3);
  });
});
