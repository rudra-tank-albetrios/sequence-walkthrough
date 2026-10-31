import { useFlowStore } from '../../shared/state/flowStore.ts';
import { DIAGRAM_THEMES, type DiagramTheme } from '../../shared/storage/settings.ts';
import { toast } from '../../shared/ui/toast.ts';
import { importFile, importText, type ImportResult } from './importer.ts';

const isTheme = (value: string): value is DiagramTheme =>
  (DIAGRAM_THEMES as readonly string[]).includes(value);

/** Loads an import result into the viewer and tells the user; false when nothing was loaded. */
export function applyImport(result: ImportResult): boolean {
  if (!result.ok) {
    toast(result.message);
    return false;
  }
  const store = useFlowStore.getState();
  if (result.theme !== null && isTheme(result.theme) && result.theme !== store.settings.theme) {
    store.updateSettings({ theme: result.theme });
  }
  store.setCode(result.code);
  if (result.message) toast(result.message);
  return true;
}

export const loadText = async (text: string): Promise<boolean> => applyImport(await importText(text));

export const loadFile = async (file: File): Promise<boolean> => applyImport(await importFile(file));
