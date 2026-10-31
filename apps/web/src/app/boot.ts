import { parseHash } from '../shared/lib/codec.ts';
import { DEFAULT_DIAGRAM } from '../shared/lib/defaultDiagram.ts';
import { loadSavedCode } from '../shared/storage/settings.ts';

export interface InitialCode {
  code: string;
  /** 0-based step to open on, from the link. */
  step: number | null;
  message: string | null;
}

/** Precedence: code in the link, then the autosaved code, then the default diagram. */
export async function loadInitialCode(hash: string): Promise<InitialCode> {
  const parsed = hash.length > 1 ? await parseHash(hash) : { code: null, step: null, failed: false };
  if (parsed.code?.trim()) {
    return { code: parsed.code, step: parsed.step, message: 'Loaded the diagram from the link' };
  }
  const saved = loadSavedCode();
  const code = saved?.trim() ? saved : DEFAULT_DIAGRAM;
  return {
    code,
    step: parsed.step,
    message: parsed.failed ? 'The code in this link could not be read, so the saved code is shown' : null,
  };
}
