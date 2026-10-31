import type { Flow } from '@swv/core';

import { useFlowStore } from '../state/flowStore.ts';
import { allTerms, useGlossaryStore } from '../state/glossaryStore.ts';
import { useNotesStore } from '../state/notesStore.ts';
import { toast } from '../ui/toast.ts';
import { copyWithFallback, saveFile } from './files.ts';
import { csvText, markdownText, type NoteLookup } from './stepTable.ts';
import { fileName } from './util.ts';

/** The step table's two exports, offered by the Export menu and by the table's own footer. */

/** The flow when it is a sequence diagram, else a toast and null. */
function tableFlow(): Flow | null {
  const { flow } = useFlowStore.getState();
  if (!flow?.isSequence) {
    toast('The step table works with sequence diagrams');
    return null;
  }
  return flow;
}

/** The notes when the table's "Include my notes" box is ticked. */
function includedNotes(): NoteLookup | undefined {
  if (!useFlowStore.getState().ui.tableNotes) return undefined;
  return useNotesStore.getState().entry;
}

export async function saveTableCsv(): Promise<void> {
  const flow = tableFlow();
  if (!flow) return;
  await saveFile(fileName(flow.title, 'csv'), csvText(flow, includedNotes()), 'text/csv');
}

export async function copyTableMarkdown(): Promise<void> {
  const flow = tableFlow();
  if (!flow) return;
  const notes = includedNotes();
  const terms = allTerms(flow, useGlossaryStore.getState().saved);
  await copyWithFallback(
    markdownText(flow, { terms, ...(notes ? { notes } : {}) }),
    'Copied the step table as Markdown',
  );
}
