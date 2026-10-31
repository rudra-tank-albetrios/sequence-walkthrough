import { beforeEach, describe, expect, it } from 'vitest';

import { Store } from '../storage/store.ts';
import {
  AI_SETTINGS_KEY,
  DEFAULT_AI_SETTINGS,
  isReady,
  loadAiSettings,
  modelFor,
  normalizeSettings,
  saveAiSettings,
  useAiSettingsStore,
  type AiSettings,
} from './aiSettings.ts';
import { PROVIDERS } from './providers.ts';

beforeEach(() => {
  for (const key of Store.keys('swv:')) Store.del(key);
});

describe('swv:ai', () => {
  it('loads the shape version 2 wrote unchanged', () => {
    const v2 = {
      provider: 'gemini',
      keys: { gemini: 'AIza-old', groq: 'gsk_old' },
      models: { gemini: 'gemini-2.0-flash' },
      customUrl: '',
      includePayload: false,
      autoNote: true,
      mode: 'general',
    };
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(v2));
    expect(loadAiSettings()).toEqual(v2);
    useAiSettingsStore.getState().reload();
    expect(useAiSettingsStore.getState().settings).toEqual(v2);
  });

  it('falls back to the defaults for missing or odd fields', () => {
    expect(loadAiSettings()).toEqual(DEFAULT_AI_SETTINGS);
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify({ provider: 'nope', keys: 'x', mode: 42 }));
    expect(loadAiSettings()).toEqual(DEFAULT_AI_SETTINGS);
  });

  it('writes the same shape back', () => {
    const settings: AiSettings = { ...DEFAULT_AI_SETTINGS, provider: 'mistral', keys: { mistral: 'm' } };
    saveAiSettings(settings);
    expect(JSON.parse(localStorage.getItem(AI_SETTINGS_KEY) ?? '')).toEqual(settings);
    expect(Object.keys(settings).sort()).toEqual(
      ['provider', 'keys', 'models', 'customUrl', 'includePayload', 'autoNote', 'mode'].sort(),
    );
  });

  it('lists the eight providers in menu order', () => {
    expect(PROVIDERS.map((p) => p.id)).toEqual([
      'groq',
      'gemini',
      'openrouter',
      'cerebras',
      'mistral',
      'ollama',
      'custom',
      'claude',
    ]);
  });

  it('knows when a question can be sent', () => {
    expect(isReady(DEFAULT_AI_SETTINGS)).toBe(false);
    expect(isReady({ ...DEFAULT_AI_SETTINGS, keys: { groq: 'k' } })).toBe(true);
    expect(isReady({ ...DEFAULT_AI_SETTINGS, provider: 'ollama' })).toBe(true);
    expect(isReady({ ...DEFAULT_AI_SETTINGS, provider: 'custom' })).toBe(false);
    expect(isReady({ ...DEFAULT_AI_SETTINGS, provider: 'custom', customUrl: 'https://p.example/v1' })).toBe(true);
    expect(isReady({ ...DEFAULT_AI_SETTINGS, provider: 'claude' })).toBe(false);
  });

  it('normalises a draft the way version 2 saved it', () => {
    const draft: AiSettings = {
      ...DEFAULT_AI_SETTINGS,
      keys: { groq: '  gsk  ', gemini: '   ' },
      models: { groq: 'llama-3.3-70b-versatile', gemini: ' gemini-2.0-flash ' },
      customUrl: ' https://p.example/v1 ',
    };
    expect(normalizeSettings(draft)).toEqual({
      ...DEFAULT_AI_SETTINGS,
      keys: { groq: 'gsk' },
      models: { gemini: 'gemini-2.0-flash' },
      customUrl: 'https://p.example/v1',
    });
    expect(modelFor({ ...DEFAULT_AI_SETTINGS, models: { groq: 'x' } })).toBe('x');
    expect(modelFor(DEFAULT_AI_SETTINGS)).toBe('llama-3.3-70b-versatile');
  });
});
