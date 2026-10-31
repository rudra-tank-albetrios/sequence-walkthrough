import { create } from 'zustand';

import { Store } from '../../shared/storage/store.ts';

export type AskMode = 'project' | 'general';

/**
 * What Ask AI keeps in `swv:ai`, under the names version 2 gave them. Version 2's providers and keys
 * moved to the model list in `@swv/ai`, which reads them from this key once and removes them.
 */
export interface AiSettings {
  includePayload: boolean;
  autoNote: boolean;
  mode: AskMode;
}

export const AI_SETTINGS_KEY = 'swv:ai';

export const DEFAULT_AI_SETTINGS: AiSettings = {
  includePayload: true,
  autoNote: true,
  mode: 'project',
};

/** Reads the stored settings, filling in defaults for missing or malformed fields. */
export function loadAiSettings(): AiSettings {
  const stored = Store.get<Partial<Record<keyof AiSettings, unknown>> | null>(AI_SETTINGS_KEY, null) ?? {};
  const d = DEFAULT_AI_SETTINGS;
  return {
    includePayload: typeof stored.includePayload === 'boolean' ? stored.includePayload : d.includePayload,
    autoNote: typeof stored.autoNote === 'boolean' ? stored.autoNote : d.autoNote,
    mode: stored.mode === 'general' ? 'general' : 'project',
  };
}

/** Writes over these fields only, so anything version 2 left there waits for `@swv/ai` to move it. */
export function saveAiSettings(settings: AiSettings): void {
  Store.set(AI_SETTINGS_KEY, { ...Store.get<object | null>(AI_SETTINGS_KEY, null), ...settings });
}

export interface AiSettingsState {
  settings: AiSettings;
  /** Merges a patch, saves and notifies the dialogs. */
  update: (patch: Partial<AiSettings>) => void;
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
  reload() {
    set({ settings: loadAiSettings() });
  },
}));
