import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { consentMissing, grantConsent, modelHost } from './consent.ts';
import {
  applyEdit,
  endpointUrl,
  hasUsableModel,
  loadModelState,
  modelProblem,
  newModel,
  saveModelState,
  urlProblem,
} from './models.ts';
import { PRESETS } from './presets.ts';
import { readStored, resetAiStorage } from './testing.ts';

beforeEach(resetAiStorage);
afterEach(() => {
  vi.unstubAllGlobals();
});

const seedV2 = (value: object) => {
  localStorage.setItem('swv:ai', JSON.stringify(value));
};

describe('moving version 2 settings over', () => {
  const v2 = {
    provider: 'gemini',
    keys: { gemini: 'AIza-old', groq: 'gsk_old' },
    models: { gemini: 'gemini-2.0-flash' },
    customUrl: '',
    includePayload: false,
    autoNote: true,
    mode: 'general',
  };

  it('makes one entry per saved key, the chosen provider first and active', () => {
    seedV2(v2);
    const state = loadModelState();
    expect(state.models.map((m) => [m.preset, m.key, m.model])).toEqual([
      ['gemini', 'AIza-old', 'gemini-2.0-flash'],
      ['groq', 'gsk_old', 'llama-3.3-70b-versatile'],
    ]);
    expect(state.activeId).toBe(state.models[0]?.id);
  });

  it('marks nothing as a fallback: only the person chooses that', () => {
    seedV2(v2);
    expect(loadModelState().models.every((m) => !m.fallback)).toBe(true);
  });

  it('removes the keys from the old place and leaves the other settings', () => {
    seedV2(v2);
    loadModelState();
    expect(readStored('swv:ai')).toEqual({ includePayload: false, autoNote: true, mode: 'general' });
    expect(JSON.stringify(readStored('swv:ai'))).not.toContain('AIza-old');
    expect(JSON.stringify(readStored('swv:ai:models'))).toContain('AIza-old');
  });

  it('runs once: loading again changes nothing', () => {
    seedV2(v2);
    const first = loadModelState();
    expect(loadModelState()).toEqual(first);
  });

  it('moves a custom link with its key', () => {
    seedV2({ provider: 'custom', keys: { custom: 'k' }, customUrl: ' https://proxy.example/v1/chat/completions ' });
    const [entry] = loadModelState().models;
    expect(entry).toMatchObject({ preset: 'custom', url: 'https://proxy.example/v1/chat/completions', key: 'k' });
  });

  it('moves a chosen provider that needs no key', () => {
    seedV2({ provider: 'ollama', keys: {} });
    const state = loadModelState();
    expect(state.models.map((m) => m.preset)).toEqual(['ollama']);
    expect(state.activeId).toBe(state.models[0]?.id);
  });

  it('makes no entry for a provider that needs a key and has none', () => {
    seedV2({ provider: 'groq', keys: {}, models: {}, customUrl: '' });
    expect(loadModelState().models).toEqual([]);
  });

  it('adds a key to a matching entry instead of duplicating it', () => {
    const saved = { ...newModel('groq'), key: '' };
    saveModelState({ models: [saved], activeId: saved.id, switchAt: 5, forgetKeys: false });
    seedV2({ provider: 'groq', keys: { groq: 'gsk_new' } });
    const state = loadModelState();
    expect(state.models.map((m) => [m.id, m.key])).toEqual([[saved.id, 'gsk_new']]);
  });

  it('ignores odd data', () => {
    seedV2({ provider: 'nope', keys: 'x', models: 7, customUrl: 3 });
    expect(loadModelState().models).toEqual([]);
    localStorage.setItem('swv:ai', 'not json');
    expect(loadModelState().models).toEqual([]);
  });
});

describe('the saved list', () => {
  it('starts empty, with a switch level of 5%', () => {
    expect(loadModelState()).toEqual({ models: [], activeId: '', switchAt: 5, forgetKeys: false });
    expect(hasUsableModel()).toBe(false);
  });

  it('keeps the order, limits and fallback choice through a save', () => {
    const a = { ...newModel('groq'), key: 'a', fallback: true, limits: { requestsPerDay: 100, tokensPerDay: null } };
    const b = { ...newModel('gemini'), key: 'b' };
    saveModelState({ models: [b, a], activeId: a.id, switchAt: 12, forgetKeys: false });
    const state = loadModelState();
    expect(state.models).toEqual([b, a]);
    expect(state).toMatchObject({ activeId: a.id, switchAt: 12 });
  });

  it('drops malformed entries and repairs the rest', () => {
    localStorage.setItem(
      'swv:ai:models',
      JSON.stringify({
        models: [
          { id: '', name: 'no id', preset: 'groq' },
          { id: 'x', name: 'unknown preset', preset: 'skynet' },
          { id: 'ok', name: 'Fine', preset: 'groq', limits: 'odd', fallback: 'yes', key: 5 },
          'nonsense',
        ],
        switchAt: 900,
      }),
    );
    const state = loadModelState();
    expect(state.models.map((m) => m.id)).toEqual(['ok']);
    expect(state.models[0]).toMatchObject({ fallback: false, key: '', limits: { requestsPerDay: null, tokensPerDay: null } });
    expect(state.switchAt).toBe(5);
    expect(state.activeId).toBe('ok');
  });

  it('reads as empty when the stored list is not JSON', () => {
    localStorage.setItem('swv:ai:models', '{');
    expect(loadModelState().models).toEqual([]);
  });

  it('never trusts a stored URL for a preset: the key goes to the preset URL', () => {
    localStorage.setItem(
      'swv:ai:models',
      JSON.stringify({ models: [{ id: 'g', name: 'Groq', preset: 'groq', url: 'https://evil.example', key: 'k' }] }),
    );
    const [entry] = loadModelState().models;
    if (!entry) throw new Error('no entry');
    expect(endpointUrl(entry)).toBe(PRESETS[0]?.url);
  });
});

describe('Forget key when this tab closes', () => {
  const groq = { ...newModel('groq'), key: 'gsk_secret' };

  it('keeps the key out of localStorage, in this tab only', () => {
    saveModelState({ models: [groq], activeId: groq.id, switchAt: 5, forgetKeys: true });
    expect(localStorage.getItem('swv:ai:models')).not.toContain('gsk_secret');
    expect(sessionStorage.getItem('swv:ai:tab-keys')).toContain('gsk_secret');
    expect(loadModelState().models[0]?.key).toBe('gsk_secret');
  });

  it('loses the key when the tab is gone, and keeps the rest of the entry', () => {
    saveModelState({ models: [groq], activeId: groq.id, switchAt: 5, forgetKeys: true });
    sessionStorage.clear();
    const [entry] = loadModelState().models;
    expect(entry).toMatchObject({ id: groq.id, name: 'Groq', key: '' });
    expect(modelProblem(entry ?? groq)).toBe('Add the API key for Groq.');
    expect(hasUsableModel()).toBe(false);
  });

  it('moves keys back when turned off, and clears the tab copy', () => {
    saveModelState({ models: [groq], activeId: groq.id, switchAt: 5, forgetKeys: true });
    saveModelState({ ...loadModelState(), forgetKeys: false });
    expect(localStorage.getItem('swv:ai:models')).toContain('gsk_secret');
    expect(sessionStorage.getItem('swv:ai:tab-keys')).toBeNull();
  });
});

describe('model links', () => {
  it.each([
    ['https://proxy.example/v1/chat/completions'],
    ['https://proxy.example:8443/v1'],
    ['http://localhost:11434/v1/chat/completions'],
    ['http://127.0.0.1:8080/v1'],
    ['https://proxy.example/v1?api-version=2024'],
  ])('accepts %s', (url) => {
    expect(urlProblem(url)).toBeNull();
  });

  it.each([
    ['', /Add the link/],
    ['not a url', /not a valid URL/],
    ['http://proxy.example/v1', /https:\/\//],
    ['http://localhost.evil.example/v1', /https:\/\//],
    ['ftp://proxy.example', /https:\/\//],
    ['javascript:alert(1)', /https:\/\//],
    ['file:///etc/passwd', /https:\/\//],
    ['https://user:secret@proxy.example/v1', /not in the link/],
    ['https://proxy.example/v1?api_key=abc', /not in the link/],
    ['https://proxy.example/v1?access_token=abc', /not in the link/],
  ])('refuses %j', (url, problem) => {
    expect(urlProblem(url)).toMatch(problem);
  });
});

describe('a key stays with its URL', () => {
  const custom = { ...newModel('custom'), url: 'https://one.example/v1', key: 'secret', model: 'm' };

  it('drops the key when the link changes and the key was not typed again', () => {
    const moved = applyEdit(custom, { ...custom, url: 'https://two.example/v1' });
    expect(moved.key).toBe('');
  });

  it('drops the key when the preset changes', () => {
    const groq = { ...newModel('groq'), key: 'gsk' };
    expect(applyEdit(groq, { ...groq, preset: 'gemini' }).key).toBe('');
  });

  it('keeps a key that was typed for the new link', () => {
    const moved = applyEdit(custom, { ...custom, url: 'https://two.example/v1', key: 'new' });
    expect(moved.key).toBe('new');
  });

  it('keeps the key through any other edit', () => {
    expect(applyEdit(custom, { ...custom, name: 'Renamed', fallback: true }).key).toBe('secret');
  });
});

describe('readiness', () => {
  it('asks for a key only where one is required', () => {
    expect(modelProblem({ ...newModel('groq') })).toBe('Add the API key for Groq.');
    expect(modelProblem({ ...newModel('groq'), key: 'k' })).toBeNull();
    expect(modelProblem(newModel('ollama'))).toBeNull();
    expect(modelProblem({ ...newModel('custom'), url: 'https://p.example/v1' })).toBeNull();
    expect(modelProblem(newModel('custom'))).toMatch(/Add the link/);
    expect(modelProblem({ ...newModel('custom'), url: 'http://p.example/v1' })).toMatch(/https/);
  });

  it('uses Claude only when the artifact host offers it', () => {
    expect(modelProblem(newModel('claude'))).toMatch(/Claude artifact/);
    vi.stubGlobal('claude', { use: () => Promise.resolve(() => Promise.resolve({ text: 'hi' })) });
    expect(modelProblem(newModel('claude'))).toBeNull();
  });
});

describe('the privacy notice', () => {
  const groq = { ...newModel('groq'), key: 'k' };
  const secondGroq = { ...newModel('groq'), key: 'k2', model: 'other' };
  const gemini = { ...newModel('gemini'), key: 'k' };

  it('is needed once per host', () => {
    expect(consentMissing([groq])).toEqual([groq]);
    grantConsent([groq]);
    expect(consentMissing([groq, secondGroq])).toEqual([]);
    expect(consentMissing([groq, gemini])).toEqual([gemini]);
  });

  it('names the host the text goes to', () => {
    expect(modelHost(groq)).toBe('api.groq.com');
    expect(modelHost({ ...newModel('custom'), url: 'https://proxy.example:8443/v1' })).toBe('proxy.example:8443');
    expect(modelHost(newModel('claude'))).toMatch(/Claude/);
  });
});
