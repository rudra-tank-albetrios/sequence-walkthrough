import { expect, test, type Page } from '@playwright/test';

import { open } from './helpers.ts';

/**
 * A stand-in for the browser's voices, so every test decides when a sentence ends. The real voices
 * depend on the device and cannot be heard by a test.
 */
const FAKE_SPEECH = `
  const log = { spoken: [], current: null, paused: false, cancels: 0 };
  window.__speech = log;
  class Utterance {
    constructor(text) { this.text = text; this.rate = 1; this.voice = null; this.lang = ''; }
  }
  const voices = [
    { name: 'Basic', lang: 'en-US', voiceURI: 'basic', default: true, localService: true },
    { name: 'Natural Aria', lang: 'en-US', voiceURI: 'aria', default: false, localService: true },
  ];
  const api = new EventTarget();
  api.getVoices = () => voices;
  api.speak = (u) => { log.spoken.push({ text: u.text, rate: u.rate, voice: u.voice && u.voice.voiceURI }); log.current = u; };
  api.cancel = () => {
    log.cancels += 1;
    const u = log.current;
    log.current = null;
    if (u && u.onerror) u.onerror({ error: 'canceled' });
  };
  api.pause = () => { log.paused = true; };
  api.resume = () => { log.paused = false; };
  Object.defineProperty(window, 'speechSynthesis', { value: api, configurable: true });
  window.SpeechSynthesisUtterance = Utterance;
  window.__finishPiece = () => {
    const u = log.current;
    log.current = null;
    if (u && u.onend) u.onend({});
  };
`;

interface SpeechLog {
  spoken: { text: string; rate: number; voice: string | null }[];
  paused: boolean;
  cancels: number;
}

const speechLog = (page: Page) => page.evaluate<SpeechLog>('window.__speech');
const spokenCount = async (page: Page) => (await speechLog(page)).spoken.length;
const finishPiece = (page: Page) => page.evaluate('window.__finishPiece()');
const stepLabel = (page: Page) => page.getByRole('textbox', { name: /step/i }).first();
const play = (page: Page) => page.getByRole('button', { name: 'Play', exact: true });
const pause = (page: Page) => page.getByRole('button', { name: 'Pause', exact: true });
const mute = (page: Page) => page.getByRole('button', { name: 'Mute the voice' });

const openVoiced = async (page: Page, settings: object = {}) => {
  await page.addInitScript(FAKE_SPEECH);
  await open(page, { storage: { 'swv:settings': JSON.stringify({ speed: 1000, ...settings }) } });
};

/** Reads every piece of the step now being spoken. */
const finishStep = async (page: Page) => {
  const before = await stepLabel(page).inputValue();
  await expect
    .poll(async () => {
      await finishPiece(page);
      return stepLabel(page).inputValue();
    })
    .not.toBe(before);
};

test.describe('voice', () => {
  test('V1 Play starts the voice, in simple words, and the next step waits for it', async ({ page }) => {
    await openVoiced(page);
    expect(await spokenCount(page)).toBe(0);
    await play(page).click();
    await expect(stepLabel(page)).toHaveValue('1');
    await expect.poll(() => spokenCount(page)).toBeGreaterThan(0);
    const { spoken } = await speechLog(page);
    expect(spoken[0]?.text.length).toBeGreaterThan(0);
    for (const { text } of spoken) expect(text).not.toMatch(/[`*]|\/api\//);

    // Well past the one second a step is set to take, the voice is still reading step 1.
    await page.waitForTimeout(1500);
    await expect(stepLabel(page)).toHaveValue('1');
    await finishStep(page);
    await expect(stepLabel(page)).toHaveValue('2');
  });

  test('V2 mute silences only the voice, and the flow keeps playing', async ({ page }) => {
    await openVoiced(page);
    await play(page).click();
    await expect.poll(() => spokenCount(page)).toBeGreaterThan(0);
    await mute(page).click();
    await expect(mute(page)).toHaveAttribute('aria-pressed', 'true');
    const count = await spokenCount(page);
    await expect(stepLabel(page)).toHaveValue('2', { timeout: 5000 });
    await expect(stepLabel(page)).toHaveValue('3', { timeout: 5000 });
    expect(await spokenCount(page)).toBe(count);
    await expect(pause(page)).toBeVisible();

    await page.reload();
    await expect(mute(page)).toHaveAttribute('aria-pressed', 'true');
  });

  test('V3 pause holds the speech and Play carries on from there', async ({ page }) => {
    await openVoiced(page);
    await play(page).click();
    await expect.poll(() => spokenCount(page)).toBeGreaterThan(0);
    await pause(page).click();
    expect((await speechLog(page)).paused).toBe(true);
    const { spoken, cancels } = await speechLog(page);
    await page.waitForTimeout(1500);
    await expect(stepLabel(page)).toHaveValue('1');

    await play(page).click();
    const after = await speechLog(page);
    expect(after.paused).toBe(false);
    expect(after.spoken).toHaveLength(spoken.length);
    expect(after.cancels).toBe(cancels);
    await expect(stepLabel(page)).toHaveValue('1');
    await finishStep(page);
    await expect(stepLabel(page)).toHaveValue('2');
  });

  test('V4 a skip stops the old speech and reads the new step', async ({ page }) => {
    await openVoiced(page);
    await play(page).click();
    await expect.poll(() => spokenCount(page)).toBeGreaterThan(0);
    const { spoken, cancels } = await speechLog(page);
    await page.getByRole('button', { name: 'Next step' }).click();
    await expect(stepLabel(page)).toHaveValue('2');
    await expect.poll(() => spokenCount(page)).toBeGreaterThan(spoken.length);
    const after = await speechLog(page);
    expect(after.cancels).toBeGreaterThan(cancels);
    expect(after.spoken[spoken.length]?.text).not.toBe(spoken[0]?.text);
  });

  test('V5 a skip while paused stays silent until Play', async ({ page }) => {
    await openVoiced(page);
    await play(page).click();
    await expect.poll(() => spokenCount(page)).toBeGreaterThan(0);
    await pause(page).click();
    const { spoken, cancels } = await speechLog(page);
    await page.getByRole('button', { name: 'Next step' }).click();
    await expect(stepLabel(page)).toHaveValue('2');
    await expect.poll(async () => (await speechLog(page)).cancels).toBeGreaterThan(cancels);
    expect(await spokenCount(page)).toBe(spoken.length);

    await play(page).click();
    await expect.poll(() => spokenCount(page)).toBeGreaterThan(spoken.length);
    await expect(stepLabel(page)).toHaveValue('2');
  });

  test('V6 walking by hand does not speak', async ({ page }) => {
    await openVoiced(page);
    await page.getByRole('button', { name: 'Next step' }).click();
    await page.getByRole('button', { name: 'Next step' }).click();
    await expect(stepLabel(page)).toHaveValue('2');
    expect(await spokenCount(page)).toBe(0);
  });

  test('V7 speed and voice are chosen in settings and remembered, clearest voice by default', async ({ page }) => {
    await openVoiced(page);
    await play(page).click();
    await expect.poll(() => spokenCount(page)).toBeGreaterThan(0);
    const first = (await speechLog(page)).spoken[0];
    expect(first?.voice).toBe('aria');
    expect(first?.rate).toBe(1);
    await pause(page).click();

    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('menuitem', { name: 'Theme and display' }).click();
    const speed = page.getByLabel('Voice speed');
    await expect(speed.locator('option')).toHaveText(['0.5x', '0.75x', '1x', '1.25x', '1.5x', '2x']);
    await speed.selectOption('2');
    await page.getByLabel('Voice', { exact: true }).selectOption('basic');
    await expect(page.getByText('how they sound depends on it')).toBeVisible();

    await page.reload();
    const saved = await page.evaluate<{ voiceRate: number; voiceURI: string }>(
      `JSON.parse(localStorage.getItem('swv:settings'))`,
    );
    expect(saved).toMatchObject({ voiceRate: 2, voiceURI: 'basic' });
    await play(page).click();
    await expect.poll(() => spokenCount(page)).toBeGreaterThan(0);
    expect((await speechLog(page)).spoken[0]).toMatchObject({ voice: 'basic', rate: 2 });
  });

  test('V8 where speech is unsupported the icon is hidden and the flow still plays', async ({ page }) => {
    await page.addInitScript(`
      delete window.speechSynthesis;
      Object.defineProperty(window, 'speechSynthesis', { value: undefined });
      delete Window.prototype.speechSynthesis;
    `);
    await open(page, { storage: { 'swv:settings': JSON.stringify({ speed: 1000 }) } });
    await expect(play(page)).toBeVisible();
    await expect(mute(page)).toHaveCount(0);
    await play(page).click();
    await expect(stepLabel(page)).toHaveValue('1');
    await expect(stepLabel(page)).toHaveValue('2', { timeout: 5000 });
  });
});
