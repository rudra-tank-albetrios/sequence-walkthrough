import { useFlowStore } from '../shared/state/flowStore.ts';

/**
 * Esc closes the top-most thing, in this order: Find, Ask, the note editor, Follow, the spotlight,
 * the path filter, hidden controls, Insight, the code panel, the table view on a phone, playing,
 * and finally goes back to the overview. Dialogs and menus close themselves before this runs.
 */
export function escapeCascade(narrow: boolean): void {
  const s = useFlowStore.getState();
  const steps: [boolean, () => void][] = [
    [s.ui.findOpen, () => s.setUi({ findOpen: false })],
    [s.ui.askOpen, () => s.setUi({ askOpen: false })],
    [s.ui.noteOpen, () => s.setUi({ noteOpen: false })],
    [s.follow !== null, () => s.setFollow(null)],
    [s.spot !== null, () => s.setSpot(null)],
    [s.path !== 'all', () => s.setPath('all')],
    [s.ui.controlsHidden, () => s.setUi({ controlsHidden: false, presenter: false })],
    [s.ui.insightOpen, () => s.setUi({ insightOpen: false })],
    [s.ui.codeOpen, () => s.setUi({ codeOpen: false })],
    [s.view === 'table' && narrow, () => s.setView('diagram')],
    [s.playing, () => s.setPlaying(false)],
  ];
  const hit = steps.find(([open]) => open);
  if (hit) hit[1]();
  else s.go(-1, { camera: false });
}
