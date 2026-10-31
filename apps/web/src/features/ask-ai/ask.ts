import type { Step } from '@swv/core';

import { useNotesStore } from '../../shared/state/notesStore.ts';
import { isReady, type AiSettings } from './aiSettings.ts';
import { readCached, writeCached } from './cache.ts';
import { providerFor, type Provider } from './providers.ts';
import { buildUserMessage, complete, endpointFor, type AskContext, type CompleteOptions } from './request.ts';

export interface AskResult {
  answer: string;
  /** True when the answer came from `swv:ai:cache` and nothing was sent. */
  cached: boolean;
  provider: Provider;
  model: string;
}

export interface AskArgs {
  settings: AiSettings;
  question: string;
  /** Null in general mode or when there is no step. */
  context: AskContext | null;
  /** `Ask again`: skip the cache and send the question. */
  bypassCache?: boolean;
  signal?: AbortSignal;
}

/** Thrown when no provider is ready; the panel shows the settings link for it. */
export class NotReadyError extends Error {
  constructor() {
    super('No AI provider set up yet.');
    this.name = 'NotReadyError';
  }
}

/** Answers a question about a step: cache first, then the provider. */
export async function askQuestion({ settings, question, context, bypassCache = false, signal }: AskArgs): Promise<AskResult> {
  if (!isReady(settings)) throw new NotReadyError();
  const provider = providerFor(settings.provider);
  const user = buildUserMessage(question, settings, context);
  const model = provider.artifact ? 'quick' : endpointFor(settings).model;
  if (!bypassCache) {
    const hit = readCached(provider.id, user);
    if (hit) return { answer: hit, cached: true, provider, model };
  }
  const options: CompleteOptions = signal ? { signal } : {};
  const answer = (await complete(settings, user, options)).trim();
  writeCached(provider.id, user, answer);
  return { answer, cached: false, provider, model };
}

/** `Q: …` / `A: …`, appended to the step's note after a blank line, as version 2 saved answers. */
export function appendAnswerToNote(step: Step, question: string, answer: string): void {
  const notes = useNotesStore.getState();
  const existing = notes.entry(step)?.note ?? '';
  const block = `Q: ${question.trim()}\nA: ${answer.trim()}`;
  const note = [existing, block].filter((part) => part.trim()).join('\n\n');
  notes.setNote(step, note);
}

const TYPED_TERM = /^what(?:'s| is| does)\s+"?([^"?]+?)"?\s*(?:mean)?\??$/i;
const QUOTED_TERM = /^what is "([^"]+)" here\?$/i;

/** The word a `What is X?` question asks about, so the answer can go to the glossary. */
export function termOf(question: string): string | null {
  const q = question.trim();
  const match = QUOTED_TERM.exec(q) ?? TYPED_TERM.exec(q);
  const term = match?.[1]?.trim();
  if (!term) return null;
  return term;
}

