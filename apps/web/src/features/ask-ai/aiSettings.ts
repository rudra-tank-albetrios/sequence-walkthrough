import { create } from 'zustand';

import { Store } from '../../shared/storage/store.ts';
import { isProviderId, providerFor, type ProviderId } from './providers.ts';

export type AskMode = 'project' | 'general';

/**
 * `swv:ai`, exactly the shape version 2 wrote, so a stored provider choice and its keys keep
 * working. `keys` and `models` are keyed by provider id.
 */
export interface AiSettings {
  provider: ProviderId;
  keys: Record<string, string>;
  models: Record<string, string>;
  customUrl: string;
  includePayload: boolean;
  autoNote: boolean;
  mode: AskMode;
}

export const AI_SETTINGS_KEY = 'swv:ai';

export const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: 'groq',
  keys: {},
  models: {},
  customUrl: '',
  includePayload: true,
  autoNote: true,
  mode: 'project',
};

const isStringMap = (value: unknown): value is Record<string, string> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((v) => typeof v === 'string');

/** Reads the stored settings, filling in defaults for missing or malformed fields. */
export function loadAiSettings(): AiSettings {
  const stored = Store.get<Partial<Record<keyof AiSettings, unknown>>>(AI_SETTINGS_KEY, {});
  const d = DEFAULT_AI_SETTINGS;
  return {
    provider: isProviderId(stored.provider) ? stored.provider : d.provider,
    keys: isStringMap(stored.keys) ? stored.keys : {},
    models: isStringMap(stored.models) ? stored.models : {},
    customUrl: typeof stored.customUrl === 'string' ? stored.customUrl : d.customUrl,
    includePayload:
      typeof stored.includePayload === 'boolean' ? stored.includePayload : d.includePayload,
    autoNote: typeof stored.autoNote === 'boolean' ? stored.autoNote : d.autoNote,
    mode: stored.mode === 'general' ? 'general' : 'project',
  };
}

export function saveAiSettings(settings: AiSettings): void {
  Store.set(AI_SETTINGS_KEY, settings);
}

export interface AiSettingsState {
  settings: AiSettings;
  /** Merges a patch, saves and notifies the dialogs. */
  update: (patch: Partial<AiSettings>) => void;
  /** Replaces the whole set (the settings dialog's Save). */
  replace: (settings: AiSettings) => void;
  /** Re-reads storage, for tests and for a page that changed the key elsewhere. */
  reload: () => void;
}

export const useAiSettingsStore = create<AiSettingsState>((set, get) => ({
  settings: loadAiSettings(),
  update(patch) {
    const settings = { ...get().settings, ...patch };
    saveAiSettings(settings);
    set({ settings });
  },
  replace(settings) {
    saveAiSettings(settings);
    set({ settings });
  },
  reload() {
    set({ settings: loadAiSettings() });
  },
}));

/** Whether the Claude artifact host exposes its `use` capability on this page. */
export function hasClaudeHost(): boolean {
  const host: unknown = (window as unknown as { claude?: unknown }).claude;
  return (
    typeof host === 'object' && host !== null && 'use' in host && typeof host.use === 'function'
  );
}

/** Whether a question can be sent with these settings (version 2's `ready()`). */
export function isReady(settings: AiSettings): boolean {
  const p = providerFor(settings.provider);
  if (p.artifact) return hasClaudeHost();
  if (p.id === 'custom') return settings.customUrl.trim() !== '';
  return p.key !== 'required' || Boolean(settings.keys[p.id]);
}

/** Trims the fields and drops empty keys and models equal to the provider's default, as version 2 saved them. */
export function normalizeSettings(draft: AiSettings): AiSettings {
  const keys: Record<string, string> = {};
  for (const [id, value] of Object.entries(draft.keys)) if (value.trim()) keys[id] = value.trim();
  const models: Record<string, string> = {};
  for (const [id, value] of Object.entries(draft.models)) {
    const model = value.trim();
    if (model && model !== providerFor(id).model) models[id] = model;
  }
  return { ...draft, keys, models, customUrl: draft.customUrl.trim() };
}

/** The model that will be used: the saved override or the provider's default. */
export function modelFor(settings: AiSettings): string {
  const p = providerFor(settings.provider);
  return settings.models[p.id] ?? p.model;
}
