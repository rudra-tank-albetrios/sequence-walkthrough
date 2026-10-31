import { beforeEach, describe, expect, it } from 'vitest';

import { diagramTheme, loadSettings, SETTINGS_KEY } from './settings.ts';
import { Store } from './store.ts';

describe('stored settings', () => {
  beforeEach(() => {
    for (const key of Store.keys('swv:')) Store.del(key);
  });

  it('keeps a theme saved by version 2 as the choice it was', () => {
    const v2 = { theme: 'forest', wheel: 'zoom', dim: true, grid: false, speed: 2000, bands: false, cardH: 240, fold: { bar: true } };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(v2));
    const settings = loadSettings();
    expect(settings).toMatchObject(v2);
    expect(settings.themeAuto).toBe(false);
    expect(settings.pageTheme).toBe('system');
    expect(diagramTheme(settings, true)).toBe('forest');
  });

  it('follows the page until a theme is picked', () => {
    const settings = loadSettings();
    expect(settings.themeAuto).toBe(true);
    expect(diagramTheme(settings, false)).toBe('redux-color');
    expect(diagramTheme(settings, true)).toBe('redux-dark-color');
    expect(diagramTheme({ ...settings, theme: 'neutral', themeAuto: false }, true)).toBe('neutral');
  });

  it('falls back from values it does not know', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ theme: 'nope', pageTheme: 'sepia', wheel: 'x', speed: 'fast' }));
    expect(loadSettings()).toMatchObject({ theme: 'redux-color', pageTheme: 'system', wheel: 'scroll', speed: 3000 });
  });
});
