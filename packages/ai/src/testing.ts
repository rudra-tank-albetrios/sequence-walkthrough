/**
 * Test helpers for anything that calls models. Import from `@swv/ai/testing`, in tests only. No
 * real provider is ever reached.
 *
 *   mockModel(options?: MockModelOptions): MockModel
 *
 * Saves one model, marks its host as announced, and replaces `fetch`:
 *
 *   const mock = mockModel({ reply: JSON.stringify({ questions: [] }) });
 *   const result = await callModel({ … });
 *   expect(mock.calls).toHaveLength(1);
 *   expect(mock.calls[0]?.body.max_tokens).toBe(1200);
 *   mock.restore();
 */
import { grantConsent } from './consent.ts';
import { loadModelState, newModel, saveModelState, type ModelEntry } from './models.ts';
import { readJson, removeKey } from './storage.ts';

/** One reply from the mock provider. */
export interface MockReply {
  /** The model's text, wrapped in the OpenAI reply shape. */
  reply?: string;
  status?: number;
  headers?: Record<string, string>;
  /** A raw response body, instead of `reply`. */
  body?: string;
  /** Fail like a blocked or lost connection. */
  networkError?: boolean;
}

export interface MockCall {
  url: string;
  authorization: string;
  body: {
    model?: string;
    max_tokens?: number;
    messages?: { role: string; content: string }[];
  };
}

export interface MockFetch {
  calls: MockCall[];
  restore: () => void;
}

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

function toResponse({ reply = 'OK', status = 200, headers = {}, body }: MockReply): Response {
  const text = body ?? JSON.stringify({ choices: [{ message: { content: reply } }] });
  return new Response(text, { status, headers: { ...CORS, ...headers } });
}

/**
 * Replaces `fetch`. `replies` is one reply for every call, a list used in order (the last repeats),
 * or a function of the URL, for tests with several hosts.
 */
export function mockFetch(replies: MockReply | readonly MockReply[] | ((url: string) => MockReply)): MockFetch {
  const original = globalThis.fetch;
  const calls: MockCall[] = [];
  const pick = (url: string): MockReply => {
    if (typeof replies === 'function') return replies(url);
    if (!Array.isArray(replies)) return replies as MockReply;
    const list = replies as readonly MockReply[];
    return list[Math.min(calls.length - 1, list.length - 1)] ?? {};
  };
  globalThis.fetch = (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as MockCall['body']) : {};
    calls.push({ url, authorization: headers.get('authorization') ?? '', body });
    const chosen = pick(url);
    return chosen.networkError ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve(toResponse(chosen));
  };
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

/** Saves these models as the list, in order, the first one active, and announces their hosts. */
export function seedModels(...models: readonly Partial<ModelEntry>[]): ModelEntry[] {
  const entries = models.map((m) => ({ ...newModel(m.preset ?? 'groq'), key: 'test-key', ...m }));
  const state = loadModelState();
  saveModelState({ ...state, models: entries, activeId: entries[0]?.id ?? '' });
  grantConsent(entries);
  return entries;
}

export interface MockModelOptions extends MockReply {
  /** Fields of the saved model. Default: a Groq entry with the key `test-key`. */
  model?: Partial<ModelEntry>;
}

export interface MockModel extends MockFetch {
  entry: ModelEntry;
}

/** One saved model and a replaced `fetch`. See the top of this file. */
export function mockModel({ model = {}, ...reply }: MockModelOptions = {}): MockModel {
  const [entry] = seedModels(model);
  if (!entry) throw new Error('mockModel: no model saved');
  return { entry, ...mockFetch(reply) };
}

/** Forgets everything this package stored, for a clean start between tests. */
export function resetAiStorage(): void {
  for (const key of ['swv:ai', 'swv:ai:models', 'swv:ai:usage', 'swv:ai:consent', 'swv:ai:cache']) removeKey(key);
  removeKey('swv:ai:tab-keys', 'session');
}

export { readJson as readStored };
