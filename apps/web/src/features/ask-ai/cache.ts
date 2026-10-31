import { hashStr } from '../../shared/lib/util.ts';
import { Store } from '../../shared/storage/store.ts';

/** `swv:ai:cache`: answers by `hashStr(provider + '|' + user message)`, the 200 newest kept. */
export const AI_CACHE_KEY = 'swv:ai:cache';
const KEEP = 200;

interface CacheEntry {
  a: string;
  t: number;
}

type Cache = Record<string, CacheEntry>;

export const cacheHash = (provider: string, user: string): string => hashStr(`${provider}|${user}`);

const read = (): Cache => {
  const stored = Store.get<unknown>(AI_CACHE_KEY, null);
  return typeof stored === 'object' && stored !== null ? (stored as Cache) : {};
};

/** The saved answer for this provider and message, or null. Holds no key and no context. */
export function readCached(provider: string, user: string): string | null {
  const entry = read()[cacheHash(provider, user)];
  return typeof entry?.a === 'string' && entry.a ? entry.a : null;
}

export function writeCached(provider: string, user: string, answer: string): void {
  const entries = Object.entries({ ...read(), [cacheHash(provider, user)]: { a: answer, t: Date.now() } });
  const kept = entries.length > KEEP ? entries.sort(([, x], [, y]) => y.t - x.t).slice(0, KEEP) : entries;
  Store.set(AI_CACHE_KEY, Object.fromEntries(kept));
}
