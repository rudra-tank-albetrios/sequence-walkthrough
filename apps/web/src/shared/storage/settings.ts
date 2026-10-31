import { VOICE_RATES } from '../lib/speech.ts';
import { Store } from './store.ts';

/** Mermaid themes the viewer offers, as version 2 did. */
export const DIAGRAM_THEMES = [
  'redux-color',
  'redux',
  'redux-dark',
  'redux-dark-color',
  'default',
  'dark',
  'neutral',
  'forest',
] as const;
export type DiagramTheme = (typeof DIAGRAM_THEMES)[number];

type WheelMode = 'scroll' | 'zoom';

/** The page's own colours: what the system asks for, unless the user picks one. */
export const PAGE_THEMES = ['system', 'light', 'dark'] as const;
export type PageTheme = (typeof PAGE_THEMES)[number];

/** `swv:settings`, the shape version 2 wrote. New fields get defaults; unknown fields are kept. */
export interface Settings {
  theme: DiagramTheme;
  /** True until the user picks a diagram theme: the diagram then follows the page's colours. */
  themeAuto: boolean;
  pageTheme: PageTheme;
  wheel: WheelMode;
  dim: boolean;
  grid: boolean;
  /** Milliseconds per step while playing. */
  speed: number;
  bands: boolean;
  /** Silences only the voice; the flow keeps playing. */
  voiceMuted: boolean;
  /** How fast the voice reads, as a multiple of normal speech. */
  voiceRate: number;
  /** The chosen voice, or empty for the clearest one installed. */
  voiceURI: string;
  /** Height of the step bar in pixels, when the user dragged it. */
  cardH?: number;
  /** Which parts the user folded away: the header (`top`) and the step bar (`bar`). */
  fold?: Partial<Record<'top' | 'bar', boolean>>;
}

export const SETTINGS_KEY = 'swv:settings';

const DEFAULT_SETTINGS: Settings = {
  theme: 'redux-color',
  themeAuto: true,
  pageTheme: 'system',
  wheel: 'scroll',
  dim: false,
  grid: true,
  speed: 3000,
  bands: true,
  voiceMuted: false,
  voiceRate: 1,
  voiceURI: '',
};

export const isDiagramTheme = (value: unknown): value is DiagramTheme =>
  typeof value === 'string' && (DIAGRAM_THEMES as readonly string[]).includes(value);

export function loadSettings(): Settings {
  const stored = Store.get<Partial<Settings>>(SETTINGS_KEY, {});
  const merged: Settings = { ...DEFAULT_SETTINGS, ...stored };
  if (!isDiagramTheme(merged.theme)) merged.theme = DEFAULT_SETTINGS.theme;
  // A theme saved by version 2 was the user's choice; only a missing one follows the page.
  merged.themeAuto = stored.themeAuto ?? stored.theme === undefined;
  if (!PAGE_THEMES.includes(merged.pageTheme)) merged.pageTheme = 'system';
  if (merged.wheel !== 'zoom') merged.wheel = 'scroll';
  if (typeof merged.speed !== 'number' || !Number.isFinite(merged.speed)) {
    merged.speed = DEFAULT_SETTINGS.speed;
  }
  merged.voiceMuted = (stored.voiceMuted as unknown) === true;
  if (!(VOICE_RATES as readonly number[]).includes(merged.voiceRate)) merged.voiceRate = DEFAULT_SETTINGS.voiceRate;
  if (typeof merged.voiceURI !== 'string') merged.voiceURI = DEFAULT_SETTINGS.voiceURI;
  return merged;
}

export function saveSettings(settings: Settings): void {
  Store.set(SETTINGS_KEY, settings);
}

export const DARK_QUERY = '(prefers-color-scheme: dark)';

/** The Mermaid theme to draw with: the user's pick, or the page's colours until there is one. */
export function diagramTheme(settings: Settings, pageDark: boolean): DiagramTheme {
  if (!settings.themeAuto) return settings.theme;
  return pageDark ? 'redux-dark-color' : 'redux-color';
}

/** True when the page shows its dark colours right now. */
export function pageIsDark(pageTheme: PageTheme): boolean {
  if (pageTheme !== 'system') return pageTheme === 'dark';
  return window.matchMedia(DARK_QUERY).matches;
}

/** Forces the page's colours through `<html data-theme>`, or leaves them to the system. */
export function applyPageTheme(pageTheme: PageTheme): void {
  if (pageTheme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = pageTheme;
}

/** `swv:code`: the last code the user had in the panel, written a moment after each edit. */
const CODE_KEY = 'swv:code';

export function loadSavedCode(): string | null {
  const saved = Store.get<unknown>(CODE_KEY, null);
  return typeof saved === 'string' ? saved : null;
}
export const saveCode = (code: string): void => {
  Store.set(CODE_KEY, code);
};
