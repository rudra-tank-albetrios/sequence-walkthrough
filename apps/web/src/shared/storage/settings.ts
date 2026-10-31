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

export type WheelMode = 'scroll' | 'zoom';

/** `swv:settings`, the shape version 2 wrote. New fields get defaults; unknown fields are kept. */
export interface Settings {
  theme: DiagramTheme;
  wheel: WheelMode;
  dim: boolean;
  grid: boolean;
  /** Milliseconds per step while playing. */
  speed: number;
  bands: boolean;
  /** Height of the step bar in pixels, when the user dragged it. */
  cardH?: number;
  /** Which parts the user folded away: the header (`top`) and the step bar (`bar`). */
  fold?: Partial<Record<'top' | 'bar', boolean>>;
}

export const SETTINGS_KEY = 'swv:settings';

export const DEFAULT_SETTINGS: Settings = {
  theme: 'redux-color',
  wheel: 'scroll',
  dim: false,
  grid: true,
  speed: 3000,
  bands: true,
};

const isTheme = (value: unknown): value is DiagramTheme =>
  typeof value === 'string' && (DIAGRAM_THEMES as readonly string[]).includes(value);

export function loadSettings(): Settings {
  const stored = Store.get<Partial<Settings>>(SETTINGS_KEY, {});
  const merged: Settings = { ...DEFAULT_SETTINGS, ...stored };
  if (!isTheme(merged.theme)) merged.theme = DEFAULT_SETTINGS.theme;
  if (merged.wheel !== 'zoom') merged.wheel = 'scroll';
  if (typeof merged.speed !== 'number' || !Number.isFinite(merged.speed)) {
    merged.speed = DEFAULT_SETTINGS.speed;
  }
  return merged;
}

export function saveSettings(settings: Settings): void {
  Store.set(SETTINGS_KEY, settings);
}

/** `swv:code`: the last code the user had in the panel, written a moment after each edit. */
export const CODE_KEY = 'swv:code';

export function loadSavedCode(): string | null {
  const saved = Store.get<unknown>(CODE_KEY, null);
  return typeof saved === 'string' ? saved : null;
}
export const saveCode = (code: string): void => {
  Store.set(CODE_KEY, code);
};
