import { parseFlow, type Flow, type ParsedFlow } from '@swv/core';
import { create } from 'zustand';

import { clamp } from '../lib/util.ts';
import { isDiagramTheme, loadSettings, saveSettings, type Settings } from '../storage/settings.ts';
import { announce } from '../ui/announce.ts';
import { toast } from '../ui/toast.ts';
import { pathVisible, type PathMode } from './path.ts';
import { followHits } from './search.ts';

type View = 'diagram' | 'table';

/** A word the user is following through the flow (double-click), with the steps that mention it. */
export interface FollowState {
  token: string;
  hits: number[];
}

/** Mermaid's own default limit: longer code is refused before anything reads it. */
export const MAX_CODE_SIZE = 50_000;

export interface FlowState {
  code: string;
  parsed: ParsedFlow | null;
  flow: Flow | null;
  /** Current step index; -1 is the overview card. */
  cur: number;
  view: View;
  path: PathMode;
  /** Participant alias whose arrows alone are shown, after a click on it. */
  spot: string | null;
  follow: FollowState | null;
  /** Arrow keys stay inside the current chapter. */
  chapterLock: boolean;
  playing: boolean;
  /** The text in the Find box; the table underlines the steps it matches. */
  findQuery: string;
  settings: Settings;
  /** Goes up when the camera should start over at the next drawing. */
  fitRequest: number;
  ui: {
    codeOpen: boolean;
    /** The tool shown in the big overlay, by its id in the tool registry; null when closed. */
    overlayTool: string | null;
    /** The question to ask before leaving the overlay, set while leaving would lose work (a running quiz). */
    overlayGuard: string | null;
    controlsHidden: boolean;
    presenter: boolean;
    /** The structure review overlay. */
    reviewOpen: boolean;
    /** The same overlay, opened on its threats. */
    threatsOpen: boolean;
    askOpen: boolean;
    findOpen: boolean;
    noteOpen: boolean;
    aiSettingsOpen: boolean;
    guideOpen: boolean;
    shortcutsOpen: boolean;
    importOpen: boolean;
    quizOpen: boolean;
    weakPointsOpen: boolean;
    recapOpen: boolean;
    /** The table's "Include my notes" box; it also feeds the Export menu's table items. */
    tableNotes: boolean;
    /** Text the clipboard refused, shown in a "Copy this" dialog; null when closed. */
    copyFallback: string | null;
    /** A question another feature prepared for the Ask panel, sent as it opens. */
    askQuestion: string | null;
    tourOpen: boolean;
  };

  setCode: (code: string) => void;
  /** Code from outside the editor (the example, an import, a link): the camera starts over. */
  loadCode: (code: string, theme?: string | null) => void;
  /** Mermaid refused the code: the walkthrough goes back to the flow of the last good drawing. */
  restoreFlow: (flow: Flow | null) => void;
  /** Moves to a step. `camera: false` leaves the diagram where it is. */
  go: (index: number, options?: { camera?: boolean; from?: 'editor' }) => void;
  next: () => string | null;
  prev: () => string | null;
  setView: (view: View) => void;
  setPath: (mode: PathMode) => void;
  setSpot: (alias: string | null) => void;
  setFollow: (follow: FollowState | null) => void;
  toggleChapterLock: () => void;
  setPlaying: (playing: boolean) => void;
  setFindQuery: (query: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  setUi: (patch: Partial<FlowState['ui']>) => void;
  /** Set by the viewer when a step is shown so the camera can follow; read by features. */
  lastGo: { index: number; camera: boolean; from?: 'editor'; seq: number };
}

/** The same followed value in a new flow, or nothing when no step mentions it any more. */
function refollow(flow: Flow | null, follow: FollowState | null): FollowState | null {
  if (!follow) return null;
  const hits = followHits(flow, follow.token) ?? [];
  return hits.length > 0 ? { token: follow.token, hits } : null;
}

/** Next step that the path filter and the chapter lock allow: an index, -1 at the edge, -2 locked. */
function nextIndex(state: FlowState, direction: 1 | -1): number {
  const flow = state.flow;
  if (!flow) return -1;
  for (let i = state.cur + direction; i >= 0 && i < flow.steps.length; i += direction) {
    const step = flow.steps[i];
    if (!step || !pathVisible(step, state.path)) continue;
    const current = flow.steps[state.cur];
    if (state.chapterLock && current && step.section !== current.section) return -2;
    return i;
  }
  return -1;
}

export const useFlowStore = create<FlowState>((set, get) => ({
  code: '',
  parsed: null,
  flow: null,
  cur: -1,
  view: 'diagram',
  path: 'all',
  spot: null,
  follow: null,
  chapterLock: false,
  playing: false,
  findQuery: '',
  settings: loadSettings(),
  ui: {
    codeOpen: false,
    overlayTool: null,
    overlayGuard: null,
    controlsHidden: false,
    presenter: false,
    reviewOpen: false,
    threatsOpen: false,
    askOpen: false,
    findOpen: false,
    noteOpen: false,
    aiSettingsOpen: false,
    guideOpen: false,
    shortcutsOpen: false,
    importOpen: false,
    quizOpen: false,
    weakPointsOpen: false,
    recapOpen: false,
    tableNotes: false,
    copyFallback: null,
    askQuestion: null,
    tourOpen: false,
  },
  lastGo: { index: -1, camera: true, seq: 0 },
  fitRequest: 0,

  setCode(code) {
    // Refused when drawn; reading it first and showing its steps would stop the page for seconds.
    if (code.length > MAX_CODE_SIZE) {
      set({ code });
      return;
    }
    const parsed = parseFlow(code);
    const flow = parsed.flow;
    const steps = flow.isSequence ? flow.steps.length : 0;
    set((s) => ({
      code,
      parsed,
      flow,
      cur: clamp(s.cur, -1, steps - 1),
      view: flow.isSequence ? s.view : 'diagram',
      spot: s.spot && flow.participants.some((p) => p.alias === s.spot) ? s.spot : null,
      follow: refollow(flow, s.follow),
    }));
  },

  loadCode(code, theme) {
    const { settings, updateSettings, setCode } = get();
    if (isDiagramTheme(theme) && (theme !== settings.theme || settings.themeAuto)) {
      updateSettings({ theme, themeAuto: false });
    }
    setCode(code);
    set((s) => ({ fitRequest: s.fitRequest + 1 }));
  },

  restoreFlow(flow) {
    const steps = flow?.isSequence ? flow.steps.length : 0;
    set((s) => ({ flow, cur: clamp(s.cur, -1, steps - 1), follow: refollow(flow, s.follow) }));
  },

  go(index, options = {}) {
    const { flow } = get();
    const count = flow?.isSequence ? flow.steps.length : 0;
    if (!count) return;
    const next = clamp(index, -1, count - 1);
    set((s) => ({
      cur: next,
      ui: next === s.cur ? s.ui : { ...s.ui, noteOpen: false, askOpen: false },
      lastGo: {
        index: next,
        camera: options.camera !== false,
        ...(options.from ? { from: options.from } : {}),
        seq: s.lastGo.seq + 1,
      },
    }));
  },

  next() {
    const i = nextIndex(get(), 1);
    if (i === -2) return 'End of this chapter. Press K to unlock the chapter.';
    if (i >= 0) get().go(i);
    return null;
  },

  prev() {
    const state = get();
    if (state.cur < 0) return null;
    const i = nextIndex(state, -1);
    if (i === -2) return 'Start of this chapter. Press K to unlock the chapter.';
    state.go(i >= 0 ? i : -1);
    return null;
  },

  setView(view) {
    if (view === 'table' && !get().flow?.isSequence) {
      toast('The table works with sequence diagrams');
      return;
    }
    set({ view });
  },
  setPath(path) {
    set({ path });
  },
  setSpot(spot) {
    set({ spot });
  },
  setFollow(follow) {
    set({ follow });
  },
  toggleChapterLock() {
    const chapterLock = !get().chapterLock;
    set({ chapterLock });
    announce(chapterLock ? 'Chapter locked: the arrow keys stay inside this chapter' : 'Chapter unlocked');
  },
  setPlaying(playing) {
    set({ playing });
  },
  setFindQuery(findQuery) {
    set({ findQuery });
  },
  updateSettings(patch) {
    set((s) => {
      const settings = { ...s.settings, ...patch };
      saveSettings(settings);
      return { settings };
    });
  },
  setUi(patch) {
    set((s) => ({ ui: { ...s.ui, ...patch } }));
  },
}));

/** The steps the current path filter shows, in order. */
export function visibleSteps(flow: Flow | null, path: PathMode): number[] {
  if (!flow?.isSequence) return [];
  return flow.steps.filter((s) => pathVisible(s, path)).map((s) => s.idx);
}
