import { z } from 'zod';

import { endpointUrl, hasClaudeHost, modelProblem, type ModelEntry } from './models.ts';
import { presetFor } from './presets.ts';
import { parseReset, readRateHeaders, type RateWindow } from './ratelimit.ts';

/** The ways one request to one model can fail. */
export type FailureKind = 'bad-key' | 'rate-limit' | 'network' | 'server' | 'bad-request' | 'bad-reply' | 'aborted';

export interface Failure {
  kind: FailureKind;
  message: string;
  status?: number;
}

export interface ChatRequest {
  system: string;
  prompt: string;
  maxTokens: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export type ChatResult =
  | { ok: true; text: string; tokens: number | null; windows: RateWindow[] }
  | { ok: false; failure: Failure; windows: RateWindow[]; retryAt: number | null };

const DEFAULT_TIMEOUT_MS = 45_000;
const TIMED_OUT = 'timed out';

/** Longest error text from a provider that is shown. Longer ones say nothing more. */
const DETAIL_CHARS = 240;

/** A reply this far over its budget is cut. Providers honour `max_tokens`, custom links may not. */
const CHARS_PER_REPLY_TOKEN = 12;

const ChatReply = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().min(1) }) })).min(1),
  usage: z.object({ total_tokens: z.number() }).optional(),
});

/** Status and error text to what auto-switch should do about it (plan section 8.3). */
export function classifyStatus(status: number, detail: string): FailureKind {
  const quota = /quota|rate.?limit|budget|exceeded|credit|exhausted/i.test(detail);
  if (status === 429 || status === 402) return 'rate-limit';
  if (status === 401) return 'bad-key';
  if (status === 403) return quota ? 'rate-limit' : 'bad-key';
  // Gemini answers a bad key with 400 INVALID_ARGUMENT "Please pass a valid API key".
  if (status === 400 && /api.?key|authori[sz]ation|credential/i.test(detail)) return 'bad-key';
  if (status === 400 && quota) return 'rate-limit';
  return status >= 500 ? 'server' : 'bad-request';
}

/** Providers disagree: `{error:{message}}`, `{message}`, `{detail}`, and Gemini's `[{error:{…}}]`. */
function errorDetail(text: string): string {
  try {
    const parsed: unknown = JSON.parse(text);
    const body: unknown = Array.isArray(parsed) ? parsed[0] : parsed;
    const fields = (body ?? {}) as { error?: { message?: unknown } | string; message?: unknown; detail?: unknown };
    const inner = typeof fields.error === 'object' ? fields.error.message : fields.error;
    const message = [inner, fields.message, fields.detail].find((m) => typeof m === 'string' && m);
    return typeof message === 'string' ? message : text;
  } catch {
    return text;
  }
}

/** A provider's words are untrusted: shortened, and never allowed to repeat the key. */
function safeDetail(text: string, key: string): string {
  const shown = key ? text.split(key).join('[key hidden]') : text;
  return shown.replace(/\s+/g, ' ').trim().slice(0, DETAIL_CHARS);
}

function statusFailure(entry: ModelEntry, status: number, detail: string): Failure {
  const kind = classifyStatus(status, detail);
  const tail = detail ? `: ${detail}` : '';
  const messages: Partial<Record<FailureKind, string>> = {
    'bad-key': `${entry.name} rejected the API key (${status})${tail}. Check the key in AI settings.`,
    'rate-limit': `${entry.name} limit reached (${status})${tail}`,
    server: `${entry.name} had a server error (${status})${tail}`,
  };
  return { kind, status, message: messages[kind] ?? `${entry.name} refused the request (${status})${tail}` };
}

/** The message for a call the browser could not complete. Test finds out more (`testModel`). */
const unreachable = (entry: ModelEntry): string =>
  `Could not reach ${entry.name} from this page. Check your connection, or test the model in AI settings.`;

function requestHeaders(entry: ModelEntry): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (entry.key) headers.Authorization = `Bearer ${entry.key}`;
  if (entry.preset === 'openrouter') {
    headers['HTTP-Referer'] = location.origin === 'null' ? 'https://sequence-walkthrough' : location.origin;
    headers['X-Title'] = 'Sequence Walkthrough';
  }
  return headers;
}

/**
 * Fetch that cannot leak: no cookies, nothing cached, and no redirects, because a redirect could
 * carry the flow text to a host the person did not choose. The key travels only in the header.
 */
const safeFetch = (url: string, init: RequestInit): Promise<Response> =>
  fetch(url, { ...init, credentials: 'omit', cache: 'no-store', redirect: 'error' });

async function sendHttp(entry: ModelEntry, request: ChatRequest): Promise<ChatResult> {
  const now = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(TIMED_OUT);
  }, request.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onAbort = () => {
    controller.abort();
  };
  request.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const response = await safeFetch(endpointUrl(entry), {
      method: 'POST',
      headers: requestHeaders(entry),
      body: JSON.stringify({
        model: entry.model,
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.prompt },
        ],
        temperature: 0.2,
        max_tokens: request.maxTokens,
      }),
      signal: controller.signal,
    });
    const windows = readRateHeaders(response.headers, now);
    const body = await response.text();
    if (!response.ok) {
      const detail = safeDetail(errorDetail(body), entry.key);
      const retry = response.headers.get('retry-after');
      return {
        ok: false,
        failure: statusFailure(entry, response.status, detail),
        windows,
        retryAt: (retry ? parseReset(retry, now) : null) ?? emptyWindowReset(windows),
      };
    }
    return readReply(entry, body, request.maxTokens, windows);
  } catch {
    if (request.signal?.aborted) return failed({ kind: 'aborted', message: 'The request was cancelled.' });
    return failed({
      kind: 'network',
      message: controller.signal.reason === TIMED_OUT ? `${entry.name} did not answer in time.` : unreachable(entry),
    });
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener('abort', onAbort);
  }
}

const failed = (failure: Failure): ChatResult => ({ ok: false, failure, windows: [], retryAt: null });

/** When a window at zero fills up again: the time to come back after a limit error. */
const emptyWindowReset = (windows: readonly RateWindow[]): number | null =>
  windows.find((w) => w.remaining === 0 && w.resetAt !== null)?.resetAt ?? null;

function readReply(entry: ModelEntry, body: string, maxTokens: number, windows: RateWindow[]): ChatResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = null;
  }
  const reply = ChatReply.safeParse(parsed);
  if (!reply.success) {
    return { ...failed({ kind: 'bad-reply', message: `${entry.name} sent no answer text.` }), windows };
  }
  const content = reply.data.choices[0]?.message.content ?? '';
  return {
    ok: true,
    text: content.slice(0, maxTokens * CHARS_PER_REPLY_TOKEN),
    tokens: reply.data.usage?.total_tokens ?? null,
    windows,
  };
}

/** The artifact host's sampler, typed only as far as this package uses it. */
type ClaudeSampler = (
  messages: readonly { role: 'user'; content: string }[],
  options: { modelTier: 'quick'; cache: boolean },
) => Promise<{ text?: string }>;
interface ClaudeHost {
  use(capability: 'sample'): Promise<ClaudeSampler>;
}

async function sendClaude(entry: ModelEntry, request: ChatRequest): Promise<ChatResult> {
  if (!hasClaudeHost()) return failed({ kind: 'bad-request', message: modelProblem(entry) ?? '' });
  try {
    const { claude } = globalThis as unknown as { claude: ClaudeHost };
    const sample = await claude.use('sample');
    const content = `${request.system}\n\n${request.prompt}`;
    const reply = await sample([{ role: 'user', content }], { modelTier: 'quick', cache: false });
    if (request.signal?.aborted) return failed({ kind: 'aborted', message: 'The request was cancelled.' });
    return typeof reply.text === 'string' && reply.text
      ? { ok: true, text: reply.text.slice(0, request.maxTokens * CHARS_PER_REPLY_TOKEN), tokens: null, windows: [] }
      : failed({ kind: 'bad-reply', message: `${entry.name} sent no answer text.` });
  } catch (error) {
    const detail = safeDetail(error instanceof Error ? error.message : String(error), '');
    return failed({ kind: 'network', message: `${entry.name} could not answer: ${detail}` });
  }
}

/** One request to one model. Never throws, and never tries another model. */
export function sendChat(entry: ModelEntry, request: ChatRequest): Promise<ChatResult> {
  return presetFor(entry.preset).artifact ? sendClaude(entry, request) : sendHttp(entry, request);
}

const KeyInfo = z.object({
  data: z.object({
    limit: z.number().nullable().optional(),
    limit_remaining: z.number().nullable().optional(),
    free_model_daily_requests: z.object({ limit: z.number(), remaining: z.number() }).optional(),
  }),
});

const nextUtcMidnight = (now: number): number => {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
};

/** Reads a key endpoint such as OpenRouter's into usage windows. Empty when it has nothing. */
export async function readKeyInfo(entry: ModelEntry, now: number): Promise<RateWindow[]> {
  const url = presetFor(entry.preset).keyInfoUrl;
  if (!url || !entry.key) return [];
  try {
    const response = await safeFetch(url, { headers: { Authorization: `Bearer ${entry.key}` } });
    if (!response.ok) return [];
    const info = KeyInfo.safeParse(await response.json());
    if (!info.success) return [];
    const { limit, limit_remaining: left, free_model_daily_requests: free } = info.data.data;
    const windows: RateWindow[] = [];
    if (free && free.limit > 0) {
      windows.push({
        name: 'free requests per day',
        unit: 'requests',
        limit: free.limit,
        remaining: Math.max(0, free.remaining),
        resetAt: nextUtcMidnight(now),
      });
    }
    if (limit && left !== null && left !== undefined) {
      windows.push({ name: 'credits on this key', unit: 'credits', limit, remaining: Math.max(0, left), resetAt: null });
    }
    return windows;
  } catch {
    return [];
  }
}

/**
 * Asks whether the host answers at all, with nothing secret and nothing readable: no key, no body.
 * A reply means the server is up, so a failed call was the browser blocking it.
 */
export async function hostAnswers(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, 8000);
  try {
    await fetch(url, { mode: 'no-cors', credentials: 'omit', cache: 'no-store', signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
