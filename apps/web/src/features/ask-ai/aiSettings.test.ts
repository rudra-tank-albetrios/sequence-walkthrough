import { beforeEach, describe, expect, it } from 'vitest';

import { Store } from '../../shared/storage/store.ts';
import {
  AI_SETTINGS_KEY,
  DEFAULT_AI_SETTINGS,
  loadAiSettings,
  saveAiSettings,
  useAiSettingsStore,
} from './aiSettings.ts';

const stored = () => JSON.parse(localStorage.getItem(AI_SETTINGS_KEY) ?? 'null') as unknown;

beforeEach(() => {
  for (const key of Store.keys('swv:')) Store.del(key);
});

describe('swv:ai', () => {
  it('reads the fields version 2 wrote', () => {
    localStorage.setItem(
      AI_SETTINGS_KEY,
      JSON.stringify({ provider: 'gemini', keys: { gemini: 'old' }, includePayload: false, autoNote: false, mode: 'general' }),
    );
    expect(loadAiSettings()).toEqual({ includePayload: false, autoNote: false, mode: 'general' });
    useAiSettingsStore.getState().reload();
    expect(useAiSettingsStore.getState().settings).toEqual({ includePayload: false, autoNote: false, mode: 'general' });
  });

  it('falls back to the defaults for missing or odd fields', () => {
    expect(loadAiSettings()).toEqual(DEFAULT_AI_SETTINGS);
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify({ includePayload: 'yes', mode: 42 }));
    expect(loadAiSettings()).toEqual(DEFAULT_AI_SETTINGS);
    localStorage.setItem(AI_SETTINGS_KEY, 'null');
    expect(loadAiSettings()).toEqual(DEFAULT_AI_SETTINGS);
  });

  it('writes over its own fields only, so version 2 keys wait to be moved', () => {
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify({ provider: 'groq', keys: { groq: 'old' } }));
    saveAiSettings({ ...DEFAULT_AI_SETTINGS, mode: 'general' });
    expect(stored()).toEqual({ provider: 'groq', keys: { groq: 'old' }, ...DEFAULT_AI_SETTINGS, mode: 'general' });
  });

  it('merges and saves a change', () => {
    useAiSettingsStore.getState().reload();
    useAiSettingsStore.getState().update({ autoNote: false });
    expect(useAiSettingsStore.getState().settings).toEqual({ ...DEFAULT_AI_SETTINGS, autoNote: false });
    expect(stored()).toEqual({ ...DEFAULT_AI_SETTINGS, autoNote: false });
  });
});
