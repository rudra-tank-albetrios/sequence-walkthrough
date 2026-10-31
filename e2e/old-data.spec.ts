import { deflateSync } from 'node:zlib';

import { expect, test, type Page } from '@playwright/test';

import {
  DEMO_NOTES_KEY,
  camera,
  diagram,
  download,
  expectNoAxeViolations,
  goToStep,
  heading,
  open,
  openFocused,
  recordClipboard,
  seed,
  stepInput,
  svg,
  toastBox,
} from './helpers.ts';

// Storage and links exactly as version 2 wrote them (docs/v2-internals.md sections 1 and 2).

const FIRST_KEY = 'U→PG|Click "Place order"';
const NOTE_ENTRY = {
  star: true,
  note: 'written in version 2',
  n: 1,
  route: 'Shopper → Pages',
  label: 'Click "Place order"',
  updated: '2025-03-01T10:00:00.000Z',
};
const LINKED = 'sequenceDiagram\n  %% @title From a link\n  A->>B: one\n  B-->>A: two\n  A->>B: three';

const zFragment = (code: string) => `#z.${deflateSync(code).toString('base64url')}`;
const liveState = (code: string, theme = 'forest') =>
  JSON.stringify({ code, mermaid: JSON.stringify({ theme }), autoSync: true, rough: false });

const bookmarks = (page: Page) => page.getByRole('dialog', { name: 'Bookmarks and notes' });

const storedJson = (page: Page, key: string) =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null') as unknown, key);

test.describe('old notes and bookmarks', () => {
  test('P1 P2 notes and stars stored by version 2 show on their steps', async ({ page }) => {
    await openFocused(page, {
      storage: { [DEMO_NOTES_KEY]: JSON.stringify({ [FIRST_KEY]: NOTE_ENTRY }) },
    });
    await expect(page.getByTestId('bm-btn')).toContainText('★ 1');
    await expect(svg(page).locator('text.swv-star')).toHaveText(['★']);
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('note-view')).toHaveText('Your note: written in version 2');
    await expect(page.getByTestId('star-btn')).toHaveAttribute('aria-pressed', 'true');
  });

  test('P2 an entry with no star and no note is dropped on save', async ({ page }) => {
    await openFocused(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('b');
    await expect
      .poll(() => storedJson(page, DEMO_NOTES_KEY))
      .toMatchObject({ [FIRST_KEY]: { star: true, n: 1, label: 'Click "Place order"' } });
    await page.keyboard.press('b');
    await expect.poll(() => storedJson(page, DEMO_NOTES_KEY)).toEqual({});
  });

  test('P3 the popover lists the marked steps and the notes of changed steps', async ({ page }) => {
    await openFocused(page, {
      storage: {
        [DEMO_NOTES_KEY]: JSON.stringify({
          [FIRST_KEY]: NOTE_ENTRY,
          'X→Y|a step that is gone': {
            star: false,
            note: 'left behind',
            n: 9,
            route: 'X → Y',
            label: 'a step that is gone',
            updated: '2025-03-01T10:00:00.000Z',
          },
        }),
      },
    });
    await page.getByTestId('bm-btn').click();
    const pop = bookmarks(page);
    await expect(pop.getByRole('heading', { name: 'Bookmarks and notes' })).toBeVisible();
    await expect(pop.getByRole('button', { name: /★ 1 · Shopper → Pages/ })).toContainText(
      'written in version 2',
    );
    await expect(pop.getByRole('heading', { name: 'Notes for changed steps' })).toBeVisible();
    await expect(pop).toContainText('left behind');
    await pop.getByRole('button', { name: /★ 1/ }).click();
    await expect(stepInput(page)).toHaveValue('1');
    await goToStep(page, 3);
    await page.getByTestId('bm-btn').click();
    await bookmarks(page).getByRole('button', { name: 'Move to step 3' }).click();
    await expect(bookmarks(page).getByRole('heading', { name: 'Notes for changed steps' })).toBeHidden();
    await expect(page.getByTestId('note-view')).toContainText('left behind');
    const clear = bookmarks(page).getByRole('button', { name: 'Delete all' });
    await clear.click();
    await bookmarks(page).getByRole('button', { name: 'Click again to delete all' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('bm-btn')).toContainText('★ 0');
    await expect.poll(() => storedJson(page, DEMO_NOTES_KEY)).toEqual({});
  });

  test('P4 notes leave as a file and come back, bad files are refused', async ({ page }) => {
    await openFocused(page, {
      storage: { [DEMO_NOTES_KEY]: JSON.stringify({ [FIRST_KEY]: NOTE_ENTRY }) },
    });
    await page.getByTestId('bm-btn').click();
    const file = await download(page, () =>
      bookmarks(page).getByRole('button', { name: 'Export notes' }).click(),
    );
    expect(file.name).toBe('Place an order notes.json');
    const parsed = JSON.parse(file.text) as { format: string; flow: string; flowId: string };
    expect(parsed).toMatchObject({
      format: 'swv-notes/1',
      flow: 'Place an order',
      flowId: 't:Place an order',
      notes: { [FIRST_KEY]: { note: 'written in version 2' } },
    });
    await bookmarks(page).getByRole('button', { name: 'Delete all' }).click();
    await bookmarks(page).getByRole('button', { name: 'Click again to delete all' }).click();
    await expect(page.getByTestId('bm-btn')).toContainText('★ 0');
    const input = bookmarks(page).getByLabel('Notes file');
    await input.setInputFiles({
      name: 'notes.json',
      mimeType: 'application/json',
      buffer: file.bytes,
    });
    await expect(toastBox(page)).toContainText('Imported 1 note');
    await expect(page.getByTestId('bm-btn')).toContainText('★ 1');
    await input.setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('not json'),
    });
    await expect(toastBox(page)).toContainText('Could not import notes: ');
  });

  test('P5 notes follow a renamed flow', async ({ page }) => {
    await openFocused(page, {
      storage: { 'swv:notes:t:The old name': JSON.stringify({ [FIRST_KEY]: NOTE_ENTRY }) },
    });
    await expect(toastBox(page)).toContainText('Your notes moved with this flow (1 step)');
    await expect(page.getByTestId('bm-btn')).toContainText('★ 1');
    expect(await storedJson(page, 'swv:notes:t:The old name')).toBeNull();
    expect(await storedJson(page, DEMO_NOTES_KEY)).toMatchObject({ [FIRST_KEY]: { star: true } });
  });

  test('P6 saved terms stored by version 2 are underlined and listed', async ({ page }) => {
    await openFocused(page, {
      storage: {
        'swv:terms:t:Place an order': JSON.stringify({
          shopper: { term: 'shopper', def: 'The person buying.', updated: '2025-03-01T10:00:00.000Z' },
        }),
      },
    });
    await page.keyboard.press('ArrowRight');
    await page.getByTestId('explain').getByRole('button', { name: 'shopper' }).click();
    const pop = page.getByTestId('term-pop');
    await expect(pop).toContainText('The person buying.');
    await expect(pop).toContainText('saved answer');
    await expect(pop.getByRole('button', { name: 'Delete' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.press('i');
    await page.getByRole('tab', { name: /Glossary/ }).click();
    await expect(page.getByTestId('insight').locator('[data-term="shopper"]')).toContainText(
      'saved answer',
    );
  });
});

test.describe('old settings', () => {
  test('P7 every saved setting comes back; fields left out take the defaults', async ({ page }) => {
    await openFocused(page, {
      storage: {
        'swv:settings': JSON.stringify({
          theme: 'forest',
          wheel: 'zoom',
          dim: true,
          grid: false,
          speed: 1000,
          bands: false,
          fold: { top: false, bar: false },
          cardH: 260,
        }),
      },
    });
    await expect(page.locator('#themeSel')).toHaveValue('forest');
    await expect(page.getByRole('button', { name: 'Wheel: Zoom' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('button', { name: 'Dim others' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('button', { name: 'Chapter band' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(page.getByLabel('Seconds per step')).toHaveValue('1000');
    await expect
      .poll(async () => (await page.getByTestId('card-cur').boundingBox())?.height)
      .toBeCloseTo(260, -1);
    await page.keyboard.press('c');
    await expect(page.getByRole('button', { name: 'Grid' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('P7 a folded header and a partial or broken file are understood', async ({ page }) => {
    await openFocused(page, {
      storage: { 'swv:settings': JSON.stringify({ theme: 'nonsense', fold: { top: true } }) },
    });
    await expect(page.locator('#topbar')).toBeHidden();
    await expect(page.locator('#wbar')).toBeVisible();
    await page.getByRole('button', { name: 'Show the header' }).click();
    await expect(page.locator('#themeSel')).toHaveValue('redux-color');
    await expect(page.getByLabel('Seconds per step')).toHaveValue('3000');
  });

  test('P8 the saved AI settings fill the dialog', async ({ page }) => {
    await openFocused(page, {
      storage: {
        'swv:ai': JSON.stringify({
          provider: 'gemini',
          keys: { gemini: 'old-test-key' },
          models: { gemini: 'gemini-old' },
          customUrl: 'https://proxy.example/v1',
          includePayload: false,
          autoNote: false,
          mode: 'general',
        }),
      },
    });
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('a');
    const ask = page.getByRole('dialog', { name: 'Ask AI about step 1' });
    await expect(ask.getByRole('button', { name: 'In general' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(ask).toContainText('Sends only the question to Google Gemini');
    await ask.getByTitle('Provider, key, model').click();
    const settings = page.getByRole('dialog', { name: 'Ask AI', exact: true });
    await expect(settings.getByRole('radio', { name: /Google Gemini/ })).toBeChecked();
    const key = settings.getByLabel('API key');
    await expect(key).toHaveAttribute('type', 'password');
    await expect(key).toHaveValue('old-test-key');
    await expect(settings.getByLabel('Model')).toHaveValue('gemini-old');
    await expect(settings.getByLabel(/Include the step/)).not.toBeChecked();
    await expect(settings.getByLabel(/Save every answer/)).not.toBeChecked();
    await settings.getByRole('radio', { name: /Custom/ }).check();
    await expect(settings.getByLabel('Endpoint URL')).toHaveValue('https://proxy.example/v1');
  });

  test('P9 an answer cached by version 2 comes back without a request', async ({ page }) => {
    const question = 'What is a hold?';
    const user = `Question: ${question}`;
    let h = 2166136261;
    const text = `groq|${user}`;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    let requests = 0;
    await page.route('https://api.groq.com/**', async (route) => {
      requests += 1;
      await route.abort();
    });
    await openFocused(page, {
      storage: {
        'swv:ai': JSON.stringify({
          provider: 'groq',
          keys: { groq: 'old-test-key' },
          models: {},
          customUrl: '',
          includePayload: true,
          autoNote: false,
          mode: 'general',
        }),
        'swv:ai:cache': JSON.stringify({
          [(h >>> 0).toString(36)]: { a: 'A cached answer.', t: 1740000000000 },
        }),
      },
    });
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('a');
    const ask = page.getByRole('dialog', { name: 'Ask AI about step 1' });
    await ask.getByLabel('Question').fill(question);
    await ask.getByRole('button', { name: 'Ask', exact: true }).click();
    const answer = ask.getByTestId('ask-answer');
    await expect(answer).toContainText('A cached answer.');
    await expect(answer.getByText('Saved answer')).toBeVisible();
    expect(requests).toBe(0);
  });

  test('P11 blocked storage still works for the session and says so', async ({ page }) => {
    await page.addInitScript(() => {
      const store = (globalThis as unknown as { Storage: { prototype: { setItem: () => void } } })
        .Storage.prototype;
      store.setItem = () => {
        throw new Error('blocked');
      };
    });
    await page.goto('/');
    await expect(toastBox(page)).toContainText(
      'Storage is blocked here, so code, notes and bookmarks last only for this session.',
    );
    await expect(svg(page)).toBeVisible({ timeout: 30_000 });
    await diagram(page).focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('b');
    await expect(page.getByTestId('bm-btn')).toContainText('★ 1');
    await page.keyboard.press('n');
    await expect(page.getByText('(storage is blocked, so only for this session)')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByTestId('bm-btn').click();
    await expect(bookmarks(page)).toContainText(
      'Storage is blocked here, so notes last only for this session. Export them to keep them.',
    );
  });
});

test.describe('old links', () => {
  test('F3 a #z. link opens its flow and step, and beats the saved code', async ({ page }) => {
    await seed(page, { 'swv:code': JSON.stringify('sequenceDiagram\n  %% @title Saved\n  A->>B: x') });
    await page.goto(`/${zFragment(LINKED)}&step=2`);
    await expect(heading(page)).toHaveText('From a link', { timeout: 30_000 });
    await expect(toastBox(page)).toContainText('Loaded the diagram from the link');
    await expect(stepInput(page)).toHaveValue('2');
    await expect(svg(page).locator('[data-step="1"].swv-cur').first()).toBeAttached();
  });

  test('F3 step-N works too, in any order', async ({ page }) => {
    await page.goto(`/#step-3&${zFragment(LINKED).slice(1)}`);
    await expect(heading(page)).toHaveText('From a link', { timeout: 30_000 });
    await expect(stepInput(page)).toHaveValue('3');
  });

  test('F3 a step alone opens the saved code on that step', async ({ page }) => {
    await open(page, { hash: '#step-5' });
    await expect(stepInput(page)).toHaveValue('5');
  });

  test('F3 a pako: link from mermaid.live opens', async ({ page }) => {
    const state = deflateSync(liveState(LINKED)).toString('base64url');
    await page.goto(`/#pako:${state}`);
    await expect(heading(page)).toHaveText('From a link', { timeout: 30_000 });
    await expect(toastBox(page)).toContainText('Loaded the diagram from the link');
  });

  test('F3 a base64: link opens', async ({ page }) => {
    const state = Buffer.from(liveState(LINKED)).toString('base64');
    await page.goto(`/#base64:${state}`);
    await expect(heading(page)).toHaveText('From a link', { timeout: 30_000 });
  });

  test('F3 a broken link falls back to the saved code and says so', async ({ page }) => {
    await seed(page, { 'swv:code': JSON.stringify('sequenceDiagram\n  %% @title Saved\n  A->>B: x') });
    await page.goto('/#z.not-valid-data');
    await expect(toastBox(page)).toContainText(
      'The code in this link could not be read, so the saved code is shown',
    );
    await expect(heading(page)).toHaveText('Saved', { timeout: 30_000 });
    await page.goto('about:blank');
    await page.goto('/#pako:%%%');
    await expect(toastBox(page)).toContainText(
      'The code in this link could not be read, so the saved code is shown',
    );
  });

  test('F1 F2 a link copied here opens the same flow on the same step', async ({ page }) => {
    await recordClipboard(page);
    await openFocused(page, { code: LINKED });
    await goToStep(page, 3);
    await page.getByRole('button', { name: /^Export/ }).click();
    await page.getByRole('menuitem', { name: /^Copy link to this step/ }).click();
    await expect(toastBox(page)).toContainText('Copied a viewer link that opens on step 3');
    const link = await page.evaluate(
      () => (globalThis as unknown as { swvCopied: string[] }).swvCopied.at(-1) ?? '',
    );
    expect(link).toMatch(/#z\.[A-Za-z0-9_-]+&step=3$/);
    await page.goto('about:blank');
    await page.goto(link);
    await expect(heading(page)).toHaveText('From a link', { timeout: 30_000 });
    await expect(stepInput(page)).toHaveValue('3');
    await expect.poll(async () => (await camera(page)).k).toBeGreaterThan(0);
  });

  test('old data leaves the page accessible', async ({ page }) => {
    await openFocused(page, {
      storage: {
        [DEMO_NOTES_KEY]: JSON.stringify({ [FIRST_KEY]: NOTE_ENTRY }),
        'swv:settings': JSON.stringify({ theme: 'redux-dark', dim: true }),
      },
    });
    await page.keyboard.press('ArrowRight');
    await expectNoAxeViolations(page);
  });
});
