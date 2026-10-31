import { askRequest, callModel, type ModelResult, type PromptTerm } from '@swv/ai';
import type { Flow, Step } from '@swv/core';

import { useNotesStore } from '../../shared/state/notesStore.ts';
import type { AiSettings } from './aiSettings.ts';

export interface AskArgs {
  flow: Flow;
  step: Step;
  terms: readonly PromptTerm[];
  settings: AiSettings;
  question: string;
  /** `Ask again`: skip the saved answer and send the question. */
  fresh?: boolean;
  signal?: AbortSignal;
}

/** Project mode tells the model about the step; general mode sends only the question. */
export function askModel({ flow, step, terms, settings, question, fresh = false, signal }: AskArgs): Promise<ModelResult<string>> {
  const context =
    settings.mode === 'project' ? { flow, step, terms, includePayload: settings.includePayload } : null;
  return callModel({ ...askRequest(question, context), fresh, ...(signal ? { signal } : {}) });
}

/** `Q: …` / `A: …`, appended to the step's note after a blank line, as version 2 saved answers. */
export function appendAnswerToNote(step: Step, question: string, answer: string): void {
  const notes = useNotesStore.getState();
  const existing = notes.entry(step)?.note ?? '';
  const block = `Q: ${question.trim()}\nA: ${answer.trim()}`;
  const note = [existing, block].filter((part) => part.trim()).join('\n\n');
  notes.setNote(step, note);
}

const TYPED_TERM = /^what(?:'s| is| does)\s+"?([^"?]+?)"?\s*(?:mean)?\??$/i;
const QUOTED_TERM = /^what is "([^"]+)" here\?$/i;

/** The word a `What is X?` question asks about, so the answer can go to the glossary. */
export function termOf(question: string): string | null {
  const q = question.trim();
  const match = QUOTED_TERM.exec(q) ?? TYPED_TERM.exec(q);
  const term = match?.[1]?.trim();
  if (!term) return null;
  return term;
}
