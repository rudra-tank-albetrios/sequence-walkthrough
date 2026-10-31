import { useFlowStore } from '../../shared/state/flowStore.ts';
import { followHits } from '../../shared/state/search.ts';
import { toast } from '../../shared/ui/toast.ts';

/** Where the right-click menu and the Follow strip leave a question for the Ask AI feature. */
export const ASK_PREFILL_KEY = 'swv:ask:prefill';

/** Starts following a value through the flow; toasts when it cannot be followed. */
export function startFollow(raw: string): boolean {
  const token = raw.trim();
  if (!token) return false;
  const state = useFlowStore.getState();
  const hits = followHits(state.flow, token);
  if (hits === null) {
    toast(`"${token}" is too short or too common to follow`);
    return false;
  }
  if (hits.length === 0) {
    toast(`"${token}" does not appear in any step`);
    return false;
  }
  state.setFollow({ token, hits });
  return true;
}

/** Opens the Ask AI panel with a question already typed. */
export function askAbout(question: string): void {
  try {
    sessionStorage.setItem(ASK_PREFILL_KEY, question);
  } catch {
    /* storage blocked: the panel opens without the question */
  }
  useFlowStore.getState().setUi({ askOpen: true });
}
