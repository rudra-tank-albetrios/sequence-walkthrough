import { createStore, del, get, update, type UseStore } from 'idb-keyval';

/**
 * Larger browser data in IndexedDB (plan section 2, decision 8), with memory as the fallback for
 * private windows and blocked storage, where it lasts until the tab closes. Every value read back
 * is untrusted: callers validate it with Zod.
 */
const memory = new Map<string, unknown>();

let usable = typeof indexedDB !== 'undefined';
let store: UseStore | null = null;

const idb = (): UseStore => (store ??= createStore('swv-data', 'kv'));

async function attempt<T>(real: () => Promise<T>, fallback: () => T): Promise<T> {
  if (!usable) return fallback();
  try {
    return await real();
  } catch {
    usable = false;
    return fallback();
  }
}

export function dbGet(key: string): Promise<unknown> {
  return attempt(
    () => get<unknown>(key, idb()),
    () => memory.get(key),
  );
}

/** Reads, changes and writes one value in a single transaction. `change` must not throw. */
export function dbUpdate(key: string, change: (stored: unknown) => unknown): Promise<void> {
  return attempt(
    () => update<unknown>(key, change, idb()),
    () => {
      memory.set(key, change(memory.get(key)));
    },
  );
}

export function dbDelete(key: string): Promise<void> {
  memory.delete(key);
  return attempt(
    () => del(key, idb()),
    () => undefined,
  );
}
