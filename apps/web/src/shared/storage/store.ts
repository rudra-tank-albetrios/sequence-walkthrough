/**
 * Browser storage behind one small API. localStorage when it works, memory otherwise (private
 * windows, blocked storage). Every key the viewer writes starts with `swv:`, and the keys written
 * by version 2 are read unchanged so notes, bookmarks, settings and keys survive the upgrade.
 */
const memory = new Map<string, string>();

let usable: boolean | null = null;

function storageUsable(): boolean {
  if (usable !== null) return usable;
  try {
    const probe = '__swv_probe';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    usable = true;
  } catch {
    usable = false;
  }
  return usable;
}

export const Store = {
  get ok(): boolean {
    return storageUsable();
  },

  get<T>(key: string, fallback: T): T {
    try {
      const raw = storageUsable() ? localStorage.getItem(key) : memory.get(key);
      return raw === null || raw === undefined ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  },

  set(key: string, value: unknown): boolean {
    const raw = JSON.stringify(value);
    memory.set(key, raw);
    if (!storageUsable()) return false;
    try {
      localStorage.setItem(key, raw);
      return true;
    } catch {
      usable = false;
      return false;
    }
  },

  del(key: string): void {
    memory.delete(key);
    try {
      if (storageUsable()) localStorage.removeItem(key);
    } catch {
      /* blocked */
    }
  },

  keys(prefix: string): string[] {
    const out = new Set([...memory.keys()].filter((k) => k.startsWith(prefix)));
    try {
      if (storageUsable()) {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k?.startsWith(prefix)) out.add(k);
        }
      }
    } catch {
      /* blocked */
    }
    return [...out];
  },
};
