import { announce } from '../ui/announce.ts';
import { toast } from '../ui/toast.ts';
import { useFlowStore } from './flowStore.ts';
import { followHits } from './search.ts';

/** Starts following a value through the flow; toasts when it cannot be followed. */
export function startFollow(raw: string): boolean {
  const token = raw.trim();
  if (!token) return false;
  const state = useFlowStore.getState();
  const hits = followHits(state.flow, token);
  if (hits === null) {
    toast(`“${token}” is too short or too common to follow`);
    return false;
  }
  if (hits.length === 0) {
    toast(`"${token}" does not appear in any step`);
    return false;
  }
  state.setFollow({ token, hits });
  announce(`${token} appears in steps ${hits.map((i) => i + 1).join(', ')}`);
  return true;
}

/** Opens the Ask panel on a "What is …?" question about a word of the current step. */
export function askAboutWord(word: string): void {
  const state = useFlowStore.getState();
  if (state.cur < 0) {
    toast('Pick a step first, then ask about a word in it');
    return;
  }
  state.setUi({ askOpen: true, askQuestion: `What is "${word}" here?` });
}
