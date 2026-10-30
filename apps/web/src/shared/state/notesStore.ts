import type { Flow, Step } from '@swv/core';
import { create } from 'zustand';

import {
  adoptNotes,
  flowId,
  loadNotes,
  saveNotes,
  touchEntry,
  type NoteEntry,
  type NotesData,
} from '../storage/notes.ts';
import { toast } from '../ui/toast.ts';
import { plural } from '../lib/util.ts';

export interface NotesState {
  /** The flow the notes belong to (`t:<title>` or `p:<participants hash>`). */
  id: string;
  data: NotesData;
  /** Loads the notes for a flow, adopting a stored set that matches its steps when it has none. */
  load: (flow: Flow | null) => void;
  entry: (step: Step | undefined) => NoteEntry | undefined;
  toggleStar: (step: Step) => boolean;
  setNote: (step: Step, text: string) => void;
  remove: (key: string) => void;
  replaceAll: (data: NotesData) => void;
}

export const useNotesStore = create<NotesState>((set, get) => ({
  id: '',
  data: {},

  load(flow) {
    if (!flow?.isSequence) return;
    const id = flowId(flow);
    if (id === get().id) return;
    const prev = get().id;
    let data = loadNotes(id);
    if (Object.keys(data).length === 0) {
      const adopted = adoptNotes(flow, id);
      if (adopted) {
        data = adopted.data;
        if (adopted.from !== `swv:notes:${prev}`) {
          toast(`Your notes moved with this flow (${plural(adopted.hits, 'step')})`);
        }
      }
    }
    set({ id, data });
  },

  entry(step) {
    return step ? get().data[step.key] : undefined;
  },

  toggleStar(step) {
    const data = { ...get().data };
    const entry = touchEntry(data, step);
    entry.star = !entry.star;
    saveNotes(get().id, data);
    set({ data });
    return entry.star;
  },

  setNote(step, text) {
    const data = { ...get().data };
    const entry = touchEntry(data, step);
    entry.note = text;
    saveNotes(get().id, data);
    set({ data });
  },

  remove(key) {
    const { [key]: _removed, ...data } = get().data;
    saveNotes(get().id, data);
    set({ data });
  },

  replaceAll(data) {
    saveNotes(get().id, data);
    set({ data });
  },
}));

/** 'star' when bookmarked, 'note' when it only has text, null otherwise. */
export function noteMark(entry: NoteEntry | undefined): 'star' | 'note' | null {
  if (!entry) return null;
  if (entry.star) return 'star';
  return entry.note.trim() ? 'note' : null;
}
