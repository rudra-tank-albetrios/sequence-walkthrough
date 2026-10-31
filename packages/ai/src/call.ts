import { z, type ZodType } from 'zod';

import { estimateTokens, MAX_PROMPT_TOKENS } from './budgets.ts';
import { readAnswer, writeAnswer, type AnswerKey } from './cache.ts';
import { readKeyInfo, sendChat, type Failure, type FailureKind } from './client.ts';
import { consentMissing, modelHost } from './consent.ts';
import { loadModelState, type ModelEntry } from './models.ts';
import { presetFor } from './presets.ts';
import type { RateWindow } from './ratelimit.ts';
import { planRoute, type Skip } from './route.ts';
import { formatReset, loadUsage, recordUsage } from './usage.ts';

/** Which model wrote a reply. */
export interface ModelRef {
  id: string;
  name: string;
  model: string;
}

/** The request of `callModel`. */
export interface ModelRequest<T> {
  /** Instructions for the model. */
  system: string;
  /** The user message. Flow text goes in through `asData(…, flowSummary(flow))`. */
  prompt: string;
  /** Reply budget, sent as `max_tokens`. Use `REPLY_TOKENS`. */
  maxTokens: number;
  /** Validates the reply. Replies are untrusted, and only what passes reaches the caller. */
  schema: ZodType<T>;
  /** `json` (default) parses the reply as JSON first, allowing code fences. `text` validates the raw text. */
  format?: 'json' | 'text';
  /** Saves and reuses the reply under this key. Without it, nothing is cached. */
  cache?: AnswerKey;
  /** "Ask again": skip the saved answer, send the request, and save the new reply. */
  fresh?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * What can go wrong, as a value:
 * - `no-model`: nothing is set up. Open AI settings: `setUi({ aiSettingsOpen: true })`.
 * - `consent-needed`: the privacy notice comes first. The same flag opens it.
 * - `prompt-too-large`: the prompt is over `MAX_PROMPT_TOKENS`.
 * - `aborted`: `signal` fired. Show nothing.
 * - `bad-key`: shown on `model`. Auto-switch does not move on from it.
 * - `rate-limit`, `network`, `server`: the last model tried failed, and no other was left.
 * - `all-used-up`: every model is at its limit. `resetAt` is the earliest reset, when known.
 * - `bad-request`: the provider refused the request, such as a model name it does not know.
 * - `bad-reply`: the reply failed `schema`. Tokens were spent; retry with `fresh: true` if it helps.
 */
export type ModelErrorKind = FailureKind | 'no-model' | 'consent-needed' | 'prompt-too-large' | 'all-used-up';

export interface ModelError {
  kind: ModelErrorKind;
  /** A plain sentence that can be shown as it is. */
  message: string;
  /** The model it happened on. */
  model?: ModelRef;
  status?: number;
  /** For `all-used-up`: the earliest reset, in milliseconds since 1970. */
  resetAt?: number;
  /** For `consent-needed`: the models the notice must name. */
  models?: ModelEntry[];
}

/** The reply of `callModel`. `notices` say what auto-switch did: "Groq limit reached, switched to Gemini". */
export type ModelResult<T> =
  | {
      ok: true;
      data: T;
      /** The reply as the model wrote it. Show it as plain text only. */
      text: string;
      model: ModelRef;
      /** True when this came from the answer cache, at no cost in tokens. */
      cached: boolean;
      /** Tokens spent: 0 from the cache, null when the provider did not say. */
      tokens: number | null;
      notices: string[];
    }
  | { ok: false; error: ModelError; notices: string[] };

/** The schema of a plain-text reply: `{ schema: TextReply, format: 'text' }`. */
export const TextReply = z.string().trim().min(1);

const refOf = (entry: ModelEntry): ModelRef => ({ id: entry.id, name: entry.name, model: entry.model });

/** A JSON reply, allowing code fences and words around it. Throws when there is none. */
function parseJsonReply(text: string): unknown {
  const body = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1] ?? text;
  const start = body.search(/[[{]/);
  const end = Math.max(body.lastIndexOf('}'), body.lastIndexOf(']'));
  return JSON.parse(body.slice(start, end + 1));
}

function validate<T>(text: string, request: ModelRequest<T>): { valid: true; data: T } | { valid: false } {
  let value: unknown = text;
  if ((request.format ?? 'json') === 'json') {
    try {
      value = parseJsonReply(text);
    } catch {
      return { valid: false };
    }
  }
  const parsed = request.schema.safeParse(value);
  return parsed.success ? { valid: true, data: parsed.data } : { valid: false };
}

function skipNotice({ model, reason }: Skip, next: ModelEntry): string {
  if (reason === 'low') return `${model.name} is almost used up, switched to ${next.name}`;
  if (reason === 'out') return `${model.name} limit reached, switched to ${next.name}`;
  return `${model.name} is not set up, switched to ${next.name}`;
}

function failureNotice(from: ModelEntry, failure: Failure, next: ModelEntry): string {
  if (failure.kind === 'rate-limit') return `${from.name} limit reached, switched to ${next.name}`;
  if (failure.kind === 'server') return `${from.name} had a server error, switched to ${next.name}`;
  return `Could not reach ${from.name}, switched to ${next.name}`;
}

function usedUp(resetAt: number | null, now: number): ModelError {
  const when = resetAt === null ? 'No reset time was given, so try again later.' : `The earliest reset is at ${formatReset(resetAt, now)}.`;
  return {
    kind: 'all-used-up',
    message: `Every model has reached its limit. ${when}`,
    ...(resetAt === null ? {} : { resetAt }),
  };
}

/** Failing over applies to limits, the network and server errors only. Anything else is shown. */
const switches = (kind: FailureKind): boolean => kind === 'rate-limit' || kind === 'network' || kind === 'server';

/**
 * Counts the request and refreshes what is known about the limits. The key endpoint is read in the
 * background, so the answer is not held up.
 */
function account(entry: ModelEntry, tokens: number, windows: readonly RateWindow[]): void {
  const now = Date.now();
  recordUsage(entry.id, { tokens, windows }, now);
  if (!presetFor(entry.preset).keyInfoUrl) return;
  void readKeyInfo(entry, now).then((info) => {
    if (info.length) recordUsage(entry.id, { windows: info, counts: false }, Date.now());
  });
}

/**
 * The one call every AI feature uses:
 *
 *   callModel<T>(request: ModelRequest<T>): Promise<ModelResult<T>>
 *
 * It goes through the answer cache, the auto-switch route (each model at most once, marked
 * fallbacks only, each with its own key) and usage accounting, validates the reply with
 * `request.schema`, and always returns a value: `{ ok: true, data, … }` or `{ ok: false, error, … }`.
 * It never throws for a model or network problem, and never logs.
 *
 *   import { asData, callModel, flowSummary, flowVersion, REPLY_TOKENS, z } from '@swv/ai';
 *
 *   const result = await callModel({
 *     system: 'Write a quiz about the flow. Reply with JSON only: {"questions":[…]}',
 *     prompt: asData('The flow', flowSummary(flow)),
 *     maxTokens: REPLY_TOKENS.quiz,
 *     schema: z.object({ questions: z.array(z.object({ step: z.number(), text: z.string() })) }),
 *     cache: { flowVersion: flowVersion(flow), step: 'quiz', question: 'easy 5 mix', mode: 'quiz' },
 *   });
 *   if (result.ok) show(result.data.questions);
 *   else if (result.error.kind === 'no-model' || result.error.kind === 'consent-needed') openSettings();
 *   else showError(result.error.message);
 */
export async function callModel<T>(request: ModelRequest<T>): Promise<ModelResult<T>> {
  const notices: string[] = [];
  const failWith = (error: ModelError): ModelResult<T> => ({ ok: false, error, notices });

  if (estimateTokens(request.system) + estimateTokens(request.prompt) > MAX_PROMPT_TOKENS) {
    return failWith({ kind: 'prompt-too-large', message: 'This request is too long to send. Shorten the text and try again.' });
  }

  if (request.cache && !request.fresh) {
    const saved = await readAnswer(request.cache, request.prompt);
    const reused = saved ? validate(saved.text, request) : null;
    if (saved && reused?.valid) {
      const model = { id: saved.modelId, name: saved.modelName, model: saved.model };
      return { ok: true, data: reused.data, text: saved.text, model, cached: true, tokens: 0, notices };
    }
  }

  const state = loadModelState();
  const now = Date.now();
  const route = planRoute(state, loadUsage(), now);
  if (!route.candidates.length) {
    const skipped = route.skipped[0];
    return failWith({
      kind: 'no-model',
      message: skipped ? `No model is ready: ${skipped.model.name} needs setting up in AI settings.` : 'No AI model set up yet.',
    });
  }
  const unannounced = consentMissing(route.candidates);
  if (unannounced.length) {
    const hosts = [...new Set(unannounced.map(modelHost))].join(', ');
    return failWith({
      kind: 'consent-needed',
      message: `Before anything is sent, read what goes to ${hosts}.`,
      models: route.candidates,
    });
  }
  const first = route.attempts[0];
  if (!first) return failWith(usedUp(route.earliestReset, now));
  for (const skip of route.skipped) {
    if (skip.model.id === state.activeId) notices.push(skipNotice(skip, first));
  }

  let last: { entry: ModelEntry; failure: Failure } | null = null;
  let allLimited = true;
  for (const [index, entry] of route.attempts.entries()) {
    if (request.signal?.aborted) return failWith({ kind: 'aborted', message: 'The request was cancelled.' });
    const reply = await sendChat(entry, request);
    const sentAt = Date.now();
    if (!reply.ok) {
      if (reply.failure.kind === 'aborted') return failWith(reply.failure);
      if (reply.failure.kind !== 'network') {
        recordUsage(
          entry.id,
          {
            ...(reply.windows.length ? { windows: reply.windows } : {}),
            ...(reply.failure.kind === 'rate-limit' ? { limited: { until: reply.retryAt } } : {}),
          },
          sentAt,
        );
      }
      if (!switches(reply.failure.kind)) return failWith({ ...reply.failure, model: refOf(entry) });
      allLimited &&= reply.failure.kind === 'rate-limit';
      last = { entry, failure: reply.failure };
      const next = route.attempts[index + 1];
      if (next) notices.push(failureNotice(entry, reply.failure, next));
      continue;
    }

    account(entry, reply.tokens ?? estimateTokens(request.system + request.prompt + reply.text), reply.windows);
    const valid = validate(reply.text, request);
    if (!valid.valid) {
      return failWith({ kind: 'bad-reply', message: `${entry.name} sent a reply that could not be used. Try again.`, model: refOf(entry) });
    }
    if (request.cache) {
      await writeAnswer(request.cache, {
        text: reply.text,
        modelId: entry.id,
        modelName: entry.name,
        model: entry.model,
        savedAt: sentAt,
      });
    }
    return { ok: true, data: valid.data, text: reply.text, model: refOf(entry), cached: false, tokens: reply.tokens, notices };
  }

  if (allLimited) {
    const usage = loadUsage();
    const resets = route.attempts.map((m) => usage[m.id]?.blockedUntil ?? 0).filter((at) => at > now);
    const soonest = [route.earliestReset, ...resets].filter((at): at is number => at !== null);
    return failWith(usedUp(soonest.length ? Math.min(...soonest) : null, Date.now()));
  }
  return failWith(last ? { ...last.failure, model: refOf(last.entry) } : usedUp(null, now));
}
