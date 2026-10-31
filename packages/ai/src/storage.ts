/**
 * Small storage helpers for this package: JSON in localStorage or sessionStorage, with memory as
 * the fallback for private windows and blocked storage. Every key starts with `swv:`.
 */
type Area = 'local' | 'session';

const memory: Record<Area, Map<string, string>> = { local: new Map(), session: new Map() };

function browserArea(area: Area): Storage | null {
  try {
    const name = area === 'local' ? 'localStorage' : 'sessionStorage';
    return name in globalThis ? globalThis[name] : null;
  } catch {
    return null;
  }
}

export function readJson(key: string, area: Area = 'local'): unknown {
  try {
    const raw = memory[area].get(key) ?? browserArea(area)?.getItem(key);
    return raw === undefined || raw === null ? undefined : (JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
}

/** Memory holds a value only while the browser refuses it, so nothing outlives its real copy. */
export function writeJson(key: string, value: unknown, area: Area = 'local'): void {
  const raw = JSON.stringify(value);
  try {
    const storage = browserArea(area);
    if (!storage) throw new Error('No storage here');
    storage.setItem(key, raw);
    memory[area].delete(key);
  } catch {
    memory[area].set(key, raw);
  }
}

export function removeKey(key: string, area: Area = 'local'): void {
  memory[area].delete(key);
  try {
    browserArea(area)?.removeItem(key);
  } catch {
    /* blocked */
  }
}

const listeners = new Set<() => void>();

/**
 * `onAiChange(listener: () => void): () => void`
 *
 * Calls the listener whenever the model list, usage or cache changes, for
 * `useSyncExternalStore`. Returns the function that stops listening.
 */
export function onAiChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyAiChange(): void {
  for (const listener of listeners) listener();
}
