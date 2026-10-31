import * as z from 'zod/mini';

import { hasClaudeHost, modelFor, type AiSettings } from './aiSettings.ts';
import { AI_SYSTEM, providerFor, shortName, type Provider } from './providers.ts';

/**
 * One chat completion with the person's chosen provider: the transport every AI feature shares.
 * The key travels only in this request's header to the provider's own URL, a redirect is refused,
 * and a reply or error that repeats the key is returned with `[key hidden]`.
 */

/** A custom endpoint must use https, except on this computer. Returns the problem, or null. */
export function customUrlProblem(raw: string): string | null {
  const text = raw.trim();
  if (!text) return 'Add the endpoint URL of your custom provider first.';
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return 'The endpoint URL is not a valid URL.';
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol === 'https:' || (url.protocol === 'http:' && local)) return null;
  return 'The endpoint URL must start with https:// (http:// is allowed only for localhost or 127.0.0.1).';
}

export interface Endpoint {
  provider: Provider;
  url: string;
  model: string;
  key: string;
}

/** Where a question goes with these settings; throws when the custom URL is not acceptable. */
export function endpointFor(settings: AiSettings): Endpoint {
  const provider = providerFor(settings.provider);
  let url = provider.url;
  if (provider.id === 'custom') {
    const problem = customUrlProblem(settings.customUrl);
    if (problem) throw new Error(problem);
    url = settings.customUrl.trim();
  }
  return { provider, url, model: modelFor(settings), key: settings.keys[provider.id] ?? '' };
}

// A reply is untrusted data (plan section 4): only these shapes are read, and only as text. The
// tree-shakeable zod/mini keeps the schemas a few hundred bytes within the first-load budget.

// Zod would probe `Function('')` once to decide on compiling schemas; the page's policy forbids
// eval and would report the probe, so it is told not to try.
z.config({ jitless: true });

/** The answer every OpenAI-style endpoint returns. */
const ANSWER = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).check(z.minLength(1)),
});

/** The two shapes providers use for an error body. */
const ERROR_BODY = z.union([
  z.pipe(z.object({ error: z.object({ message: z.string() }) }), z.transform((v) => v.error.message)),
  z.pipe(z.object({ message: z.string() }), z.transform((v) => v.message)),
]);

/** What the artifact host's sampler resolves with. */
const HOST_REPLY = z.object({ text: z.string() });

async function errorDetail(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  try {
    const json: unknown = JSON.parse(text);
    const message = ERROR_BODY.safeParse(json);
    return message.success ? message.data : JSON.stringify(json).slice(0, 200);
  } catch {
    return text.slice(0, 200);
  }
}

const TIMEOUT_MS = 45_000;

/** Reply tokens for one Ask AI answer, as version 2 set it. */
const ASK_MAX_TOKENS = 220;

export interface CompleteOptions {
  /** Aborts the request, for example when a newer question replaces it. */
  signal?: AbortSignal;
  timeoutMs?: number;
  /** The system prompt; Ask AI's by default. */
  system?: string;
  /** The reply budget; Ask AI's by default. */
  maxTokens?: number;
}

/** One OpenAI-compatible chat completion. The key travels only in this request's header. */
async function completeHttp(endpoint: Endpoint, user: string, options: CompleteOptions): Promise<string> {
  const { provider, url, model, key } = endpoint;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('The provider did not answer in time')), options.timeoutMs ?? TIMEOUT_MS);
  const onOuterAbort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', onOuterAbort, { once: true });
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) headers.Authorization = `Bearer ${key}`;
  if (provider.id === 'openrouter') {
    headers['HTTP-Referer'] = location.origin || 'https://sequence-walkthrough';
    headers['X-Title'] = 'Sequence Walkthrough';
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: options.system ?? AI_SYSTEM },
          { role: 'user', content: user },
        ],
        temperature: 0.2,
        max_tokens: options.maxTokens ?? ASK_MAX_TOKENS,
      }),
      signal: controller.signal,
      // A redirect would carry the question, and perhaps the key, to an address nobody chose.
      redirect: 'error',
      credentials: 'omit',
      cache: 'no-store',
    });
    if (!res.ok) {
      const detail = await errorDetail(res);
      throw new Error(`${res.status} ${res.statusText}${detail ? `: ${detail.slice(0, 240)}` : ''}`);
    }
    const answer = ANSWER.safeParse((await res.json()) as unknown);
    const text = answer.success ? (answer.data.choices[0]?.message.content ?? '') : '';
    if (!text) throw new Error('The provider sent no answer text');
    return text;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onOuterAbort);
  }
}

/** The artifact host's sampler, typed only as far as this feature uses it. */
type ClaudeSampler = (
  messages: readonly { role: 'user'; content: string }[],
  options: { modelTier: 'quick'; cache: boolean },
) => Promise<unknown>;
interface ClaudeHost {
  use(capability: 'sample'): Promise<ClaudeSampler>;
}

const CLAUDE_MISSING = 'Claude is not available on this page. Open the viewer as a Claude artifact, or pick another provider.';

async function completeClaude(user: string, options: CompleteOptions): Promise<string> {
  if (!hasClaudeHost()) throw new Error(CLAUDE_MISSING);
  const host = (window as unknown as { claude: ClaudeHost }).claude;
  const sample = await host.use('sample');
  const reply = await sample([{ role: 'user', content: `${options.system ?? AI_SYSTEM}\n\n${user}` }], { modelTier: 'quick', cache: false });
  const parsed = HOST_REPLY.safeParse(reply);
  return parsed.success ? parsed.data.text : '';
}

const NETWORK_FAILURE = /failed to fetch|networkerror|load failed/i;

/** The message shown when the browser could not reach the provider at all (CORS, offline). */
export const unreachable = (provider: Provider): string =>
  `Could not reach ${shortName(provider)} from this page. The provider may block browser requests; try another provider, or a proxy URL as a custom endpoint.`;

/** A provider's words can repeat the key. They reach the screen, the note and the saved answers. */
const hideKey = (text: string, key: string): string => (key ? text.split(key).join('[key hidden]') : text);

/** Asks the chosen provider and returns the answer text. Errors carry a sentence for the panel. */
export async function complete(settings: AiSettings, user: string, options: CompleteOptions = {}): Promise<string> {
  const provider = providerFor(settings.provider);
  if (provider.artifact) return completeClaude(user, options);
  const endpoint = endpointFor(settings);
  try {
    return hideKey(await completeHttp(endpoint, user, options), endpoint.key);
  } catch (err) {
    const message = hideKey(err instanceof Error ? err.message : String(err), endpoint.key);
    // The caught error is not attached as the cause: its message may repeat the key.
    // eslint-disable-next-line preserve-caught-error -- the cause could carry the key into a log
    throw new Error(NETWORK_FAILURE.test(message) ? unreachable(provider) : message);
  }
}

/** The one-word prompt the settings dialog's Test button sends. */
export const TEST_QUESTION = 'Question: Reply with the single word OK.';
