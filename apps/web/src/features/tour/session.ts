import { DEFAULT_DIAGRAM } from '../../shared/lib/defaultDiagram.ts';
import { useFlowStore, type FlowState } from '../../shared/state/flowStore.ts';
import type { TourStop } from './stops.ts';
import { markTourSeen } from './visit.ts';

type Ui = FlowState['ui'];

/** What the person had on screen before the tour, put back when it ends. */
export type SavedView = Pick<FlowState, 'code' | 'cur' | 'view' | 'path' | 'spot' | 'follow' | 'ui'> & {
  fold: FlowState['settings']['fold'];
};

/** Every panel and dialog closed, whatever flags the store has by then. The tour stays open. */
function closedUi(ui: Ui): Ui {
  const closed = Object.fromEntries(Object.keys(ui).map((flag) => [flag, false] as const));
  return { ...(closed as Ui), tourOpen: true };
}

/**
 * Puts the demo flow on a clean screen and returns what was there. The code stays out of the
 * autosave while the tour runs (app/App.tsx), so a person's saved code is safe even if the tab
 * closes half way through.
 */
export function openDemo(): SavedView {
  const s = useFlowStore.getState();
  const saved: SavedView = {
    code: s.code,
    cur: s.cur,
    view: s.view,
    path: s.path,
    spot: s.spot,
    follow: s.follow,
    ui: { ...s.ui, tourOpen: false },
    fold: s.settings.fold,
  };
  markTourSeen();
  s.setPlaying(false);
  s.setView('diagram');
  s.setPath('all');
  s.setSpot(null);
  s.setFollow(null);
  if (s.settings.fold) s.updateSettings({ fold: {} });
  if (s.code !== DEFAULT_DIAGRAM) s.setCode(DEFAULT_DIAGRAM);
  s.go(-1, { camera: false });
  return saved;
}

/** Shows what one stop needs. The camera stays put, so nothing has to be restored afterwards. */
export function showStop(stop: TourStop): void {
  const s = useFlowStore.getState();
  if (stop.step !== undefined && s.cur !== stop.step) s.go(stop.step, { camera: false });
  s.setUi({ ...closedUi(s.ui), ...stop.open });
}

/** Ends the tour with everything back as it was. The tour's own flag goes last (see `openDemo`). */
export function closeDemo(saved: SavedView): void {
  const s = useFlowStore.getState();
  if (s.code !== saved.code) s.setCode(saved.code);
  s.setView(saved.view);
  s.setPath(saved.path);
  s.setSpot(saved.spot);
  s.setFollow(saved.follow);
  s.go(saved.cur, { camera: false });
  if (saved.fold) s.updateSettings({ fold: saved.fold });
  s.setUi(saved.ui);
}
