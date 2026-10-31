import { hashStr } from '@swv/core';
import { clear, createStore, delMany, entries, get, set, type UseStore } from 'idb-keyval';
import { z } from 'zod';

import { PRESETS, presetFor } from './presets.ts';
import { notifyAiChange, readJson, removeKey } from './storage.ts';

/** Plan section 8.4: the newest 500 answers, in IndexedDB. */
const KEEP = 500;
/** Version 2's answers: `{ [hashStr(provider + '|' + prompt)]: { a, t } }`. Read, never written. */
const V2_CACHE_KEY = 'swv:ai:cache';

/**
 * What makes two questions the same. `flowVersion` and `step` change when the text the model would
 * see changes, so an answer about a changed step is not reused. The model is not part of it: a
 * saved answer serves any model, and says which one wrote it.
 */
export interface AnswerKey {
  /** `flowVersion(flow)`, or for one step a hash of its summary. Empty when no flow text is sent. */
  flowVersion: string;
  /** The step number, or a name for a reply about the whole flow, such as `quiz`. */
  step: number | string;
  question: string;
  /** The answer mode, such as `project`, `general` or `quiz`. */
  mode: string;
}

const SavedAnswer = z.object({
  text: z.string().min(1),
  modelId: z.string(),
  modelName: z.string(),
  model: z.string(),
  savedAt: z.number(),
});

/** One saved answer. Holds the text and who wrote it, never a key or the prompt. */
export type SavedAnswer = z.infer<typeof SavedAnswer>;

/** Case, spacing and closing punctuation do not make a different question. */
export const normaliseQuestion = (question: string): string =>
  question
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\s?!.]+$/, '')
    .trim();

const storageKey = (key: AnswerKey): string =>
  [key.flowVersion, key.step, key.mode, normaliseQuestion(key.question)].join('|');

interface Backend {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  del(keys: string[]): Promise<void>;
  entries(): Promise<[string, unknown][]>;
  clear(): Promise<void>;
}

const memory = new Map<string, unknown>();
const memoryBackend: Backend = {
  get: (key) => Promise.resolve(memory.get(key)),
  set: (key, value) => {
    memory.set(key, value);
    return Promise.resolve();
  },
  del: (keys) => {
    for (const key of keys) memory.delete(key);
    return Promise.resolve();
  },
  entries: () => Promise.resolve([...memory.entries()]),
  clear: () => {
    memory.clear();
    return Promise.resolve();
  },
};

const idbBackend = (store: UseStore): Backend => ({
  get: (key) => get(key, store),
  set: (key, value) => set(key, value, store),
  del: (keys) => delMany(keys, store),
  entries: () => entries<string, unknown>(store),
  clear: () => clear(store),
});

let store: UseStore | null = null;
let idbFailed = false;

/** Runs on IndexedDB when it works, and on memory otherwise (private windows, tests). */
async function withBackend<T>(run: (backend: Backend) => Promise<T>): Promise<T> {
  if (!idbFailed && typeof indexedDB !== 'undefined') {
    try {
      store ??= createStore('swv-ai', 'answers');
      return await run(idbBackend(store));
    } catch {
      idbFailed = true;
    }
  }
  return run(memoryBackend);
}

/** The answer version 2 saved for exactly this prompt, by any provider. */
function readV2Answer(prompt: string): SavedAnswer | null {
  const parsed = z.record(z.string(), z.object({ a: z.string().min(1), t: z.number() })).safeParse(readJson(V2_CACHE_KEY));
  if (!parsed.success) return null;
  for (const { id } of PRESETS) {
    const entry = parsed.data[hashStr(`${id}|${prompt}`)];
    if (entry) return { text: entry.a, modelId: '', modelName: presetFor(id).name, model: '', savedAt: entry.t };
  }
  return null;
}

/** The saved answer for this question, or null. Version 2's answers are matched by their prompt. */
export async function readAnswer(key: AnswerKey, prompt: string): Promise<SavedAnswer | null> {
  const stored = await withBackend((backend) => backend.get(storageKey(key)));
  const parsed = SavedAnswer.safeParse(stored);
  return parsed.success ? parsed.data : readV2Answer(prompt);
}

/** Saves an answer, replacing the old one, and keeps the newest 500. */
export async function writeAnswer(key: AnswerKey, answer: SavedAnswer): Promise<void> {
  await withBackend(async (backend) => {
    await backend.set(storageKey(key), answer);
    const all = await backend.entries();
    if (all.length <= KEEP) return;
    const savedAt = ([, value]: [string, unknown]): number => {
      const parsed = SavedAnswer.safeParse(value);
      return parsed.success ? parsed.data.savedAt : 0;
    };
    const oldest = all.sort((a, b) => savedAt(b) - savedAt(a)).slice(KEEP);
    await backend.del(oldest.map(([name]) => name));
  });
  notifyAiChange();
}

export interface AnswerCacheInfo {
  count: number;
  /** About how much the answers take up. */
  bytes: number;
}

/** `answerCacheInfo(): Promise<AnswerCacheInfo>`, for the size shown in settings. */
export async function answerCacheInfo(): Promise<AnswerCacheInfo> {
  const all = await withBackend((backend) => backend.entries());
  const v2 = Object.entries((readJson(V2_CACHE_KEY) as object | undefined) ?? {});
  const size = (value: unknown): number => JSON.stringify(value).length;
  return {
    count: all.length + v2.length,
    bytes: all.reduce((total, entry) => total + size(entry), 0) + v2.reduce((total, entry) => total + size(entry), 0),
  };
}

/** `clearAnswerCache(): Promise<void>`: removes every saved answer, version 2's too. */
export async function clearAnswerCache(): Promise<void> {
  await withBackend((backend) => backend.clear());
  removeKey(V2_CACHE_KEY);
  notifyAiChange();
}
