import { Store } from './store.ts';

/** One thing the viewer keeps in this browser, described without showing what it holds. */
export interface StoredEntry {
  key: string;
  label: string;
  /** The group it is listed under. */
  group: string;
  /** The size of what is stored, in bytes. */
  bytes: number;
  /** A number of things inside it, when that says more than the size. */
  items: number | null;
}

/** The flow name inside a `swv:notes:` or `swv:terms:` key: `t:<title>` or `p:<hash of its layers>`. */
const flowName = (id: string): string => (id.startsWith('t:') ? id.slice(2) : 'A flow without a title');

const FIXED: Record<string, { group: string; label: string }> = {
  'swv:code': { group: 'This page', label: 'The last code you worked on' },
  'swv:settings': { group: 'This page', label: 'Theme and display settings' },
  'swv:ai': { group: 'Ask AI', label: 'Provider, model and API keys' },
  'swv:ai:cache': { group: 'Ask AI', label: 'Saved answers' },
};

function describe(key: string): Pick<StoredEntry, 'group' | 'label'> {
  const fixed = FIXED[key];
  if (fixed) return fixed;
  if (key.startsWith('swv:notes:')) return { group: 'Notes and bookmarks', label: flowName(key.slice('swv:notes:'.length)) };
  if (key.startsWith('swv:terms:')) return { group: 'Your glossary terms', label: flowName(key.slice('swv:terms:'.length)) };
  return { group: 'Other', label: key.slice('swv:'.length) };
}

function countItems(value: unknown): number | null {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  return null;
}

/** Everything the viewer stores, grouped and named. The values never leave this function. */
export function storedEntries(): StoredEntry[] {
  return Store.keys('swv:')
    .map((key): StoredEntry => {
      const value = Store.get<unknown>(key, null);
      const counted = key === 'swv:code' || key === 'swv:settings' || key === 'swv:ai' ? null : countItems(value);
      return { key, ...describe(key), bytes: JSON.stringify(value).length, items: counted };
    })
    .sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));
}

/** A size in the words people use. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
