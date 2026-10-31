import { useFlowStore } from '../../shared/state/flowStore.ts';
import { toast } from '../../shared/ui/toast.ts';
import { importFile, importText, type ImportResult } from './importer.ts';

/** Loads an import result into the viewer and tells the user; false when nothing was loaded. */
function applyImport(result: ImportResult): boolean {
  if (!result.ok) {
    toast(result.message);
    return false;
  }
  useFlowStore.getState().loadCode(result.code, result.theme);
  if (result.message) toast(result.message);
  return true;
}

export const loadText = async (text: string): Promise<boolean> => applyImport(await importText(text));

export const loadFile = async (file: File): Promise<boolean> => applyImport(await importFile(file));
