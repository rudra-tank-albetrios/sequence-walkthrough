import type { Flow, Step } from '@swv/core';

import { hashStr } from '../lib/util.ts';
import { Store } from './store.ts';

/**
 * One step's personal data, stored under `swv:notes:<flow id>` keyed by the step's `key`
 * (`from→to|label[#n]`), exactly as version 2 wrote it. `n`, `route`, `label` and `updated` let the
 * "notes for changed steps" list show an entry whose step no longer exists.
 */
export interface NoteEntry {
  star: boolean;
  note: string;
  n?: number;
  route?: string;
  label?: string;
  updated?: string;
}

export type NotesData = Record<string, NoteEntry>;

export const NOTES_PREFIX = 'swv:notes:';

/** Notes are filed under the flow's title; a flow with no title is identified by its participants. */
export function flowId(flow: Flow): string {
  return flow.hasTitle
    ? `t:${flow.title}`
    : `p:${hashStr(flow.participants.map((p) => p.alias).join(','))}`;
}

export const route = (step: Step): string =>
  step.kind === 'self' ? `${step.fromName} ↻ itself` : `${step.fromName} → ${step.toName}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** One note from a file or from storage, or null when it is not one. Both can hold anything. */
export function toNoteEntry(value: unknown): NoteEntry | null {
  if (!isRecord(value)) return null;
  const entry: NoteEntry = {
    star: value.star === true,
    note: typeof value.note === 'string' ? value.note : '',
  };
  if (typeof value.n === 'number') entry.n = value.n;
  if (typeof value.route === 'string') entry.route = value.route;
  if (typeof value.label === 'string') entry.label = value.label;
  if (typeof value.updated === 'string') entry.updated = value.updated;
  return entry;
}

/** The well-formed entries of a stored value, whatever else is in there. */
function readEntries<T>(key: string, toEntry: (value: unknown) => T | null): Record<string, T> {
  const stored = Store.get<unknown>(key, null);
  const entries = Object.create(null) as Record<string, T>;
  if (!isRecord(stored)) return entries;
  for (const [name, value] of Object.entries(stored)) {
    const entry = toEntry(value);
    if (entry) entries[name] = entry;
  }
  return entries;
}

export function loadNotes(id: string): NotesData {
  return readEntries(NOTES_PREFIX + id, toNoteEntry);
}

export function saveNotes(id: string, data: NotesData): void {
  const kept: NotesData = {};
  for (const [key, entry] of Object.entries(data)) {
    if (entry.star || entry.note.trim()) kept[key] = entry;
  }
  Store.set(NOTES_PREFIX + id, kept);
}

/**
 * Adding or renaming `@title` would hide a flow's notes. When this flow has none, take over the
 * stored set whose steps match it best (at least half of them). Returns the adopted set and the key
 * it came from, or null.
 */
export function adoptNotes(flow: Flow, id: string): { data: NotesData; from: string; hits: number } | null {
  const keys = new Set(flow.steps.map((s) => s.key));
  let best: { from: string; data: NotesData; hits: number } | null = null;
  for (const storageKey of Store.keys(NOTES_PREFIX)) {
    if (storageKey === NOTES_PREFIX + id) continue;
    const data = readEntries(storageKey, toNoteEntry);
    const total = Object.keys(data).length;
    const hits = Object.keys(data).filter((k) => keys.has(k)).length;
    if (hits && hits * 2 >= total && (!best || hits > best.hits)) best = { from: storageKey, data, hits };
  }
  if (!best) return null;
  Store.set(NOTES_PREFIX + id, best.data);
  Store.del(best.from);
  return best;
}

/** Marks an entry as touched by the current step, creating it when needed. */
export function touchEntry(data: NotesData, step: Step): NoteEntry {
  const entry = data[step.key] ?? { star: false, note: '' };
  entry.n = step.n;
  entry.route = route(step);
  entry.label = step.label.join(' / ');
  entry.updated = new Date().toISOString();
  data[step.key] = entry;
  return entry;
}

/** `swv:terms:<flow id>`: glossary entries the user saved, keyed by the lower-cased term. */
export const TERMS_PREFIX = 'swv:terms:';

export interface SavedTerm {
  term: string;
  def: string;
  updated: string;
}

export type SavedTerms = Record<string, SavedTerm>;

function toSavedTerm(value: unknown): SavedTerm | null {
  if (!isRecord(value) || typeof value.term !== 'string' || typeof value.def !== 'string') return null;
  return { term: value.term, def: value.def, updated: typeof value.updated === 'string' ? value.updated : '' };
}

export const loadSavedTerms = (id: string): SavedTerms => readEntries(TERMS_PREFIX + id, toSavedTerm);
export const saveSavedTerms = (id: string, terms: SavedTerms): void => {
  Store.set(TERMS_PREFIX + id, terms);
};
