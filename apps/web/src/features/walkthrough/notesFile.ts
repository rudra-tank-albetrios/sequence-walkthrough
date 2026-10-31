import type { Flow } from '@swv/core';

import { downloadBlob, fileName } from '../../shared/lib/util.ts';
import { toNoteEntry, type NotesData } from '../../shared/storage/notes.ts';

/** The `swv-notes/1` file version 2 wrote and reads back. */
export interface NotesFile {
  format: 'swv-notes/1';
  flow: string;
  flowId: string;
  exported: string;
  notes: NotesData;
}

export function notesFile(flow: Flow, id: string, notes: NotesData): NotesFile {
  return { format: 'swv-notes/1', flow: flow.title, flowId: id, exported: new Date().toISOString(), notes };
}

/** Saves `<title> notes.json`. */
export function exportNotes(flow: Flow, id: string, notes: NotesData): void {
  const blob = new Blob([JSON.stringify(notesFile(flow, id, notes), null, 2)], { type: 'application/json' });
  downloadBlob(blob, fileName(`${flow.title} notes`, 'json'));
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Merges the notes of an exported file into the current set: an entry wins when its `updated`
 * stamp is newer. Returns the merged set and how many entries were written.
 */
export function importNotes(text: string, current: NotesData): { data: NotesData; count: number } {
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed) || !isRecord(parsed.notes)) throw new Error('This file has no notes in it');
  const data: NotesData = { ...current };
  let count = 0;
  for (const [key, raw] of Object.entries(parsed.notes)) {
    const entry = toNoteEntry(raw);
    if (!entry || key === '__proto__') continue;
    const existing = data[key];
    if (!existing || (entry.updated ?? '') > (existing.updated ?? '')) {
      data[key] = entry;
      count++;
    }
  }
  return { data, count };
}
