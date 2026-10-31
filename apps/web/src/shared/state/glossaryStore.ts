import type { Flow } from '@swv/core';
import { create } from 'zustand';

import { loadSavedTerms, saveSavedTerms, type SavedTerm, type SavedTerms } from '../storage/notes.ts';

export interface GlossaryEntry {
  term: string;
  def: string;
  /** `code` for a `@term` line, `saved` for one the user added or kept from an Ask AI answer. */
  source: 'code' | 'saved';
  line?: number;
}

export interface GlossaryState {
  id: string;
  saved: SavedTerms;
  load: (id: string) => void;
  add: (term: string, def: string) => void;
  remove: (term: string) => void;
}

export const useGlossaryStore = create<GlossaryState>((set, get) => ({
  id: '',
  saved: {},
  load(id) {
    if (id === get().id) return;
    set({ id, saved: loadSavedTerms(id) });
  },
  add(term, def) {
    const entry: SavedTerm = { term: term.trim(), def: def.trim(), updated: new Date().toISOString() };
    const saved = { ...get().saved, [entry.term.toLowerCase()]: entry };
    saveSavedTerms(get().id, saved);
    set({ saved });
  },
  remove(term) {
    const { [term.toLowerCase()]: _removed, ...saved } = get().saved;
    saveSavedTerms(get().id, saved);
    set({ saved });
  },
}));

/** The flow's `@term` lines and the saved terms, with the code winning on the same word. */
export function allTerms(flow: Flow | null, saved: SavedTerms): GlossaryEntry[] {
  const out = new Map<string, GlossaryEntry>();
  for (const entry of Object.values(saved)) {
    out.set(entry.term.toLowerCase(), { term: entry.term, def: entry.def, source: 'saved' });
  }
  for (const t of flow?.terms ?? []) {
    out.set(t.term.toLowerCase(), { term: t.term, def: t.def, source: 'code', line: t.line });
  }
  return [...out.values()].sort((a, b) => a.term.localeCompare(b.term));
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Matches every glossary term as a whole word, longest first. Null when there are none. */
export function termRegex(terms: GlossaryEntry[]): RegExp | null {
  if (terms.length === 0) return null;
  const words = [...terms].sort((a, b) => b.term.length - a.term.length).map((t) => escapeRegExp(t.term));
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${words.join('|')})(?![\\p{L}\\p{N}_])`, 'giu');
}
