import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

// The Export menu, its downloads, share links, the import dialog and the skill kit zip.
// Chromium only for the clipboard and download checks: SWV_E2E_PROJECTS=chromium.

const MENU_ITEMS = [
  'PDF…',
  '1×',
  '2×',
  '4×',
  'SVG',
  'Step image',
  'Code',
  'Step table',
  'Copy table as Markdown',
  'Open in mermaid.live',
  'Copy mermaid.live link',
  'Copy viewer link',
  'Copy link to this step',
  'Provider and key…',
  'Download the skill',
  'Paste a link or code…',
  'Open a file…',
];

const CSV_HEADER =
  'Step,Chapter,From,To,Kind,Status,Sends,Does,Branch,Payload,Also involved,Effects,Unconfirmed,Ref';

const BOM = String.fromCharCode(0xfeff);
const DEMO_FLOW = resolve(import.meta.dirname, '../examples/demo-store/flows/place-order.mmd');

async function openExportMenu(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('diagram').locator('svg').first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /^Export/ }).click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  return menu;
}

test.describe('export menu', () => {
  test('lists every item in order', async ({ page }) => {
    const menu = await openExportMenu(page);
    const items = menu.getByRole('menuitem');
    await expect(items).toHaveCount(MENU_ITEMS.length);
    const texts = await items.allTextContents();
    texts.forEach((text, i) => {
      expect(text.startsWith(MENU_ITEMS[i] ?? '')).toBe(true);
    });
    for (const heading of [
      'Files named after the flow',
      'Share',
      'Ask AI',
      'Skill for Claude',
      'Import',
    ]) {
      await expect(menu.getByText(heading, { exact: true })).toBeVisible();
    }
  });

  test('Code .mmd downloads the editor text', async ({ page }) => {
    const menu = await openExportMenu(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      menu.getByRole('menuitem', { name: /^Code/ }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('Place an order.mmd');
    const saved = readFileSync(await download.path(), 'utf8').replace(/\r\n/g, '\n');
    const expected = readFileSync(DEMO_FLOW, 'utf8').replace(/\r\n/g, '\n');
    expect(saved).toBe(expected);
    await expect(
      page.getByRole('status').filter({ hasText: 'Downloaded Place an order.mmd' }),
    ).toBeVisible();
  });

  test('Step table .csv has the documented header row', async ({ page }) => {
    const menu = await openExportMenu(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      menu.getByRole('menuitem', { name: /^Step table/ }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('Place an order.csv');
    const text = readFileSync(await download.path(), 'utf8');
    expect(text.startsWith(BOM)).toBe(true);
    expect(text.split('\r\n')[0]).toBe(`${BOM}${CSV_HEADER}`);
  });

  test('Copy viewer link writes a #z. link that opens the same flow', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const menu = await openExportMenu(page);
    await menu.getByRole('menuitem', { name: /^Copy viewer link/ }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Copied a viewer link' }),
    ).toBeVisible();
    // The root tsconfig has no DOM lib, so the page's navigator is typed here by hand.
    interface ClipboardPage {
      navigator: { clipboard: { readText: () => Promise<string> } };
    }
    const link = await page.evaluate(() =>
      (globalThis as unknown as ClipboardPage).navigator.clipboard.readText(),
    );
    expect(link).toMatch(/^http.*#z\.[A-Za-z0-9_-]+$/);

    await page.goto('about:blank');
    await page.goto(link);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Place an order');
    await expect(
      page.getByRole('status').filter({ hasText: 'Loaded the diagram from the link' }),
    ).toBeVisible();
  });

  test('the import dialog loads pasted code', async ({ page }) => {
    const menu = await openExportMenu(page);
    await menu.getByRole('menuitem', { name: /^Paste a link or code/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Import' });
    await expect(dialog).toBeVisible();
    await dialog
      .getByRole('textbox')
      .fill('sequenceDiagram\n  %% @title Imported flow\n  A->>B: hello\n  B-->>A: 200 OK');
    await dialog.getByRole('button', { name: 'Load' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Imported flow');
  });

  test('the skill kit zip is served next to the page', async ({ request }) => {
    const response = await request.get('/sequence-walkthrough-skill-kit.zip');
    expect(response.status()).toBe(200);
    const body = await response.body();
    expect(body.subarray(0, 2).toString('latin1')).toBe('PK');
  });
});
