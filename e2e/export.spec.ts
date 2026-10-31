import { inflateSync } from 'node:zlib';

import { expect, test, type Page } from '@playwright/test';

import {
  copied,
  demoFlow,
  diagram,
  download,
  fixture,
  goToStep,
  heading,
  open,
  openFocused,
  stepInput,
  svg,
  toastBox,
} from './helpers.ts';

// The Export menu, its downloads, share links, the import dialog and the skill kit.

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

const openMenu = async (page: Page) => {
  await page.getByRole('button', { name: /^Export/ }).click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  return menu;
};

const pick = async (page: Page, name: RegExp) => {
  const menu = await openMenu(page);
  await menu.getByRole('menuitem', { name }).click();
};

const exported = (page: Page, name: RegExp) => download(page, () => pick(page, name));

/** The width and height in a PNG's header. */
const pngSize = (bytes: Buffer) => ({
  width: bytes.readUInt32BE(16),
  height: bytes.readUInt32BE(20),
});

/** Reports that a modal asks the file input: a chooser is not needed, the input is in the page. */
const fileInput = (page: Page) => page.getByTestId('import-file');

const drawnWidth = (page: Page) =>
  svg(page).evaluate((el) => {
    const box = el as unknown as { viewBox: { baseVal: { width: number } } };
    return box.viewBox.baseVal.width;
  });

test.describe('export menu', () => {
  test('F19 the menu has its sections and items in order', async ({ page }) => {
    await open(page);
    const menu = await openMenu(page);
    const items = menu.getByRole('menuitem');
    await expect(items).toHaveCount(MENU_ITEMS.length);
    const texts = await items.allTextContents();
    texts.forEach((text, i) => {
      expect(text.startsWith(MENU_ITEMS[i] ?? '')).toBe(true);
    });
    for (const heading_ of [
      'Files named after the flow',
      'Share',
      'Ask AI',
      'Skill for Claude',
      'Import',
    ]) {
      await expect(menu.getByText(heading_, { exact: true })).toBeVisible();
    }
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  });

  test('F8 the PDF dialog gives its options and the file is a real PDF', async ({ page }) => {
    await open(page);
    await pick(page, /^PDF/);
    const dialog = page.getByRole('dialog', { name: 'Download PDF' });
    await expect(dialog).toContainText(
      'Landscape pages. The participant row is repeated at the top of every page.',
    );
    await expect(dialog.getByLabel('Add the step table at the end')).toBeChecked();
    await expect(dialog.getByLabel('Include my notes')).not.toBeChecked();
    await expect(dialog.getByLabel('Paper').locator('option')).toHaveText(['A4', 'US Letter']);
    await expect(dialog).toContainText(/\d+ diagram pages?\./);
    // The toast lasts 3.2 s and reading a large file back can take longer, so keep what it said.
    await toastBox(page).evaluate((box) => {
      const said: string[] = [];
      Reflect.set(globalThis, '__toasts', said);
      new MutationObserver(() => said.push(box.textContent)).observe(box, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    });
    const file = await download(page, () =>
      dialog.getByRole('button', { name: 'Download Place an order.pdf' }).click(),
    );
    expect(file.name).toBe('Place an order.pdf');
    expect(file.bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const pages = file.bytes.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? [];
    expect(pages.length).toBeGreaterThanOrEqual(2);
    expect(await page.evaluate(() => Reflect.get(globalThis, '__toasts'))).toContain(
      'Downloaded Place an order.pdf',
    );
  });

  test('F9 PNG at 1× and 2× has the size of the drawing', async ({ page }) => {
    await open(page, { code: fixture('payment-idempotency') });
    const width = await drawnWidth(page);
    const one = await exported(page, /^1×/);
    expect(one.name).toBe('Payment idempotency.png');
    expect(one.bytes.subarray(1, 4).toString('latin1')).toBe('PNG');
    expect(pngSize(one.bytes).width).toBeCloseTo(width, -1);
    const two = await exported(page, /^2×/);
    expect(pngSize(two.bytes).width).toBeCloseTo(width * 2, -1);
    await expect(toastBox(page)).toContainText('Downloaded Payment idempotency.png');
  });

  test('F9 a huge PNG lowers its scale and says so', async ({ page }) => {
    await open(page, { code: demoFlow() });
    const file = await exported(page, /^4×/);
    const size = pngSize(file.bytes);
    const scale = size.width / (await drawnWidth(page));
    if (scale < 3.9) {
      await expect(page.getByTestId('toast')).toBeVisible();
      expect(size.width).toBeLessThanOrEqual(16000);
      expect(size.height).toBeLessThanOrEqual(16000);
    }
  });

  test('F10 the SVG carries its background and the embedded font', async ({ page }) => {
    await open(page);
    const file = await exported(page, /^SVG/);
    expect(file.name).toBe('Place an order.svg');
    expect(file.text).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(file.text).toContain('@font-face');
    expect(file.text).toContain('Recursive Variable');
    expect(file.text).toContain('data:font/woff2;base64,');
    expect(file.text).not.toContain('swv-hit');
  });

  test('F11 the step image is named after the step or the overview', async ({ page }) => {
    await openFocused(page);
    const overview = await exported(page, /^Step image/);
    expect(overview.name).toBe('Place an order - overview.png');
    await goToStep(page, 2);
    const step = await exported(page, /^Step image/);
    expect(step.name).toBe('Place an order - step 2.png');
    expect(step.bytes.subarray(1, 4).toString('latin1')).toBe('PNG');
  });

  test('F12 Code saves the editor text', async ({ page }) => {
    await open(page);
    const file = await exported(page, /^Code/);
    expect(file.name).toBe('Place an order.mmd');
    expect(file.text.replace(/\r\n/g, '\n')).toBe(demoFlow().replace(/\r\n/g, '\n'));
    await expect(toastBox(page)).toContainText('Downloaded Place an order.mmd');
  });

  test('F13 the CSV has a byte order mark, its header and one row per step', async ({ page }) => {
    await open(page);
    const file = await exported(page, /^Step table/);
    expect(file.name).toBe('Place an order.csv');
    expect(file.text.startsWith(BOM)).toBe(true);
    const lines = file.text.slice(1).split('\r\n');
    expect(lines[0]).toBe(CSV_HEADER);
    expect(lines[1]).toMatch(/^1,Check the request,/);
    await openFocused(page, { code: fixture('not-sequence') });
    await pick(page, /^Step table/);
    await expect(toastBox(page)).toContainText('The step table works with sequence diagrams');
  });

  test('F14 the Markdown names the flow, its chapters and the proposed line', async ({ page }) => {
    await open(page, { clipboard: true });
    await pick(page, /^Copy table as Markdown/);
    await expect(toastBox(page)).toContainText('Copied the step table as Markdown');
    const text = await copied(page);
    expect(text.startsWith('# Place an order')).toBe(true);
    expect(text).toContain('## 1. Check the request');
    expect(text).toContain('## Behind the scenes');
    expect(text).toContain('## Glossary');
    await openFocused(page, { code: 'sequenceDiagram\n  %% @mode proposed\n  A->>B: one' });
    await pick(page, /^Copy table as Markdown/);
    await expect.poll(() => copied(page)).toContain('**Proposed design:**');
  });

  test('F15 files are named safely after the title', async ({ page }) => {
    await open(page, { code: 'sequenceDiagram\n  %% @title a/b:c*d?\n  A->>B: one' });
    expect((await exported(page, /^Code/)).name).toBe('abcd.mmd');
    await openFocused(page, { code: 'sequenceDiagram\n  A->>B: one' });
    expect((await exported(page, /^Code/)).name).toBe('Sequence diagram.mmd');
  });

  test('F1 F2 viewer links carry the code and the step', async ({ page }) => {
    await open(page, { clipboard: true });
    await pick(page, /^Copy viewer link/);
    await expect(toastBox(page)).toContainText('Copied a viewer link with the code inside');
    const link = await copied(page);
    expect(link).toMatch(/^http.*#z\.[A-Za-z0-9_-]+$/);
    await diagram(page).focus();
    await goToStep(page, 3);
    await pick(page, /^Copy link to this step/);
    await expect(toastBox(page)).toContainText('Copied a viewer link that opens on step 3');
    expect(await copied(page)).toMatch(/&step=3$/);
    await page.goto('about:blank');
    await page.goto(link);
    await expect(heading(page)).toHaveText('Place an order', { timeout: 30_000 });
    await expect(toastBox(page)).toContainText('Loaded the diagram from the link');
  });

  test('F4 the mermaid.live link holds the code, theme and grid; opening uses a new tab', async ({
    page,
    context,
  }) => {
    await open(page, { clipboard: true, code: 'sequenceDiagram\n  A->>B: one' });
    await page.locator('#themeSel').selectOption('forest');
    await pick(page, /^Copy mermaid.live link/);
    await expect(toastBox(page)).toContainText('Copied the mermaid.live link');
    const link = await copied(page);
    expect(link.startsWith('https://mermaid.live/edit#pako:')).toBe(true);
    const state = JSON.parse(
      inflateSync(Buffer.from(link.split('#pako:')[1] ?? '', 'base64url')).toString('utf8'),
    ) as { code: string; mermaid: string; grid: boolean };
    expect(state.code).toBe('sequenceDiagram\n  A->>B: one');
    expect(JSON.parse(state.mermaid)).toEqual({ theme: 'forest' });
    expect(state.grid).toBe(true);
    await context.route('https://mermaid.live/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }),
    );
    const [tab] = await Promise.all([
      context.waitForEvent('page'),
      pick(page, /^Open in mermaid.live/),
    ]);
    expect(tab.url()).toContain('https://mermaid.live/edit#pako:');
    expect(
      await tab.evaluate(() => (globalThis as unknown as { opener: unknown }).opener),
    ).toBeNull();
  });
});

test.describe('import', () => {
  test('F5 the dialog takes code, Markdown and a mermaid.live link', async ({ page }) => {
    await open(page);
    await pick(page, /^Paste a link or code/);
    const dialog = page.getByRole('dialog', { name: 'Import' });
    const area = dialog.getByRole('textbox');
    await expect(area).toHaveAttribute('placeholder', 'https://mermaid.live/edit#pako:...');
    await expect(area).toBeFocused();
    await expect(dialog.getByRole('button', { name: 'Open a file…' })).toBeVisible();
    await area.fill('sequenceDiagram\n  %% @title Imported flow\n  A->>B: hello');
    await dialog.getByRole('button', { name: 'Load' }).click();
    await expect(dialog).toBeHidden();
    await expect(heading(page)).toHaveText('Imported flow');

    await pick(page, /^Paste a link or code/);
    await area.fill(
      '# Notes\n\nText\n\n```mermaid\nsequenceDiagram\n  %% @title From markdown\n  A->>B: hi\n```\n',
    );
    await dialog.getByRole('button', { name: 'Load' }).click();
    await expect(heading(page)).toHaveText('From markdown');

    await pick(page, /^Paste a link or code/);
    await area.fill('https://mermaid.live/edit#pako:%%%bad');
    await dialog.getByRole('button', { name: 'Load' }).click();
    await expect(toastBox(page)).toContainText('Could not import: ');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
  });

  test('F5 a mermaid.live link brings its theme, and the camera starts over', async ({ page }) => {
    await open(page, {
      clipboard: true,
      code: 'sequenceDiagram\n  %% @title Linked\n  A->>B: one',
    });
    await page.locator('#themeSel').selectOption('forest');
    await pick(page, /^Copy mermaid.live link/);
    await expect(toastBox(page)).toContainText('Copied the mermaid.live link');
    const link = await copied(page);
    await page.locator('#themeSel').selectOption('neutral');
    await diagram(page).focus();
    await page.keyboard.press('c');
    await page.locator('#code').fill('sequenceDiagram\n  %% @title Other\n  A->>B: two');
    await expect(heading(page)).toHaveText('Other');
    await pick(page, /^Paste a link or code/);
    const dialog = page.getByRole('dialog', { name: 'Import' });
    await dialog.getByRole('textbox').fill(link);
    await dialog.getByRole('button', { name: 'Load' }).click();
    await expect(heading(page)).toHaveText('Linked');
    await expect(toastBox(page)).toContainText('Loaded the diagram from the mermaid.live link');
    await expect(page.locator('#themeSel')).toHaveValue('forest');
  });

  test('F6 a file loads, a Markdown file needs a block, other types are refused', async ({
    page,
  }) => {
    await open(page);
    const input = fileInput(page);
    await input.setInputFiles({
      name: 'mine.mmd',
      mimeType: 'text/plain',
      buffer: Buffer.from('sequenceDiagram\n  %% @title From a file\n  A->>B: hi'),
    });
    await expect(heading(page)).toHaveText('From a file');
    await expect(toastBox(page)).toContainText('Loaded mine.mmd');
    await input.setInputFiles({
      name: 'plain.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# no diagram here'),
    });
    await expect(toastBox(page)).toContainText('plain.md has no ```mermaid block');
    await input.setInputFiles({
      name: 'photo.png',
      mimeType: 'image/png',
      buffer: Buffer.from('x'),
    });
    await expect(toastBox(page)).toContainText('Drop a .mmd, .md or .txt file');
  });

  test('F6 dragging a file shows the scrim and dropping loads it', async ({ page }) => {
    await open(page);
    const payload = await page.evaluateHandle(() => {
      const scope = globalThis as unknown as {
        DataTransfer: new () => { items: { add: (f: unknown) => void } };
        File: new (bits: string[], name: string) => unknown;
      };
      const transfer = new scope.DataTransfer();
      transfer.items.add(
        new scope.File(['sequenceDiagram\n  %% @title Dropped\n  A->>B: hi'], 'dropped.mmd'),
      );
      return transfer;
    });
    await page.dispatchEvent('body', 'dragenter', { dataTransfer: payload });
    await expect(page.getByTestId('drop-scrim')).toHaveText('Drop a .mmd, .md or .txt file');
    await page.dispatchEvent('body', 'drop', { dataTransfer: payload });
    await expect(page.getByTestId('drop-scrim')).toBeHidden();
    await expect(heading(page)).toHaveText('Dropped');
    await expect(toastBox(page)).toContainText('Loaded dropped.mmd');
  });

  test('F7 pasting anywhere loads a diagram, but not while typing elsewhere', async ({ page }) => {
    await openFocused(page);
    const paste = (text: string) =>
      page.evaluate((value) => {
        const scope = globalThis as unknown as {
          DataTransfer: new () => { setData: (t: string, v: string) => void };
          ClipboardEvent: new (t: string, o: object) => unknown;
          document: { activeElement: { dispatchEvent: (e: unknown) => boolean } };
        };
        const clipboardData = new scope.DataTransfer();
        clipboardData.setData('text', value);
        scope.document.activeElement.dispatchEvent(
          new scope.ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }),
        );
      }, text);
    await paste('just some words');
    await expect(heading(page)).toHaveText('Place an order');
    await paste('sequenceDiagram\n  A->>B: hi');
    await expect(heading(page)).toHaveText('Sequence diagram');
    await page.keyboard.press('/');
    await paste('sequenceDiagram\n  %% @title Not this\n  A->>B: hi');
    await expect(heading(page)).toHaveText('Sequence diagram');
  });

  test('F7 a mermaid.live link pasted in the editor imports instead of inserting', async ({
    page,
  }) => {
    await open(page, {
      clipboard: true,
      code: 'sequenceDiagram\n  %% @title Linked\n  A->>B: one',
    });
    await pick(page, /^Copy mermaid.live link/);
    await expect(toastBox(page)).toContainText('Copied the mermaid.live link');
    const link = await copied(page);
    await diagram(page).focus();
    await page.keyboard.press('c');
    await page.locator('#code').fill('sequenceDiagram\n  %% @title Other\n  A->>B: two');
    await expect(heading(page)).toHaveText('Other');
    await page.locator('#code').evaluate((el, value) => {
      const scope = globalThis as unknown as {
        DataTransfer: new () => { setData: (t: string, v: string) => void };
        ClipboardEvent: new (t: string, o: object) => unknown;
      };
      const clipboardData = new scope.DataTransfer();
      clipboardData.setData('text', value);
      (el as unknown as { dispatchEvent: (e: unknown) => boolean }).dispatchEvent(
        new scope.ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }),
      );
    }, link);
    await expect(heading(page)).toHaveText('Linked');
    await expect(page.locator('#code')).toHaveValue(/@title Linked/);
  });
});

test.describe('saving and copying', () => {
  test('F16 without a drawing there is nothing to export', async ({ page }) => {
    await page.route(/\/assets\/.*\.js$/, async (route) => {
      if (/\/assets\/index-[^/]*\.js$/.test(route.request().url())) await route.continue();
      else await route.abort();
    });
    await page.goto('/');
    await expect(page.getByTestId('loading')).toContainText('could not be loaded');
    await pick(page, /^SVG/);
    await expect(toastBox(page)).toContainText('Nothing to export yet');
  });

  test('F17 a refused clipboard falls back to a dialog with the text', async ({ page }) => {
    await page.addInitScript(() => {
      const scope = globalThis as unknown as {
        navigator: object;
        document: { execCommand: () => boolean };
      };
      Object.defineProperty(scope.navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => Promise.reject(new Error('denied')) },
      });
      scope.document.execCommand = () => false;
    });
    await open(page);
    await pick(page, /^Copy viewer link/);
    const dialog = page.getByRole('dialog', { name: 'Copy this' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('textbox')).toHaveValue(/#z\./);
    await expect(dialog.getByRole('textbox')).toHaveAttribute('readonly', '');
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(dialog).toBeHidden();
  });

  test('F17 a refused clipboard API falls back to the older copy first', async ({ page }) => {
    await page.addInitScript(() => {
      const scope = globalThis as unknown as {
        navigator: object;
        document: { execCommand: () => boolean };
      };
      Object.defineProperty(scope.navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => Promise.reject(new Error('denied')) },
      });
      scope.document.execCommand = () => true;
    });
    await open(page);
    await pick(page, /^Copy viewer link/);
    await expect(toastBox(page)).toContainText('Copied a viewer link with the code inside');
    await expect(page.getByRole('dialog', { name: 'Copy this' })).toBeHidden();
  });

  test('F18 the skill kit comes from the menu and from How it works', async ({ page }) => {
    await open(page);
    const fromMenu = await exported(page, /^Download the skill/);
    expect(fromMenu.name).toBe('sequence-walkthrough-skill-kit.zip');
    expect(fromMenu.bytes.subarray(0, 2).toString('latin1')).toBe('PK');
    await expect(toastBox(page)).toContainText('Downloaded sequence-walkthrough-skill-kit.zip');
    await page.getByRole('button', { name: 'How it works' }).click();
    const fromGuide = await download(page, () =>
      page
        .getByRole('dialog', { name: 'How it works' })
        .getByRole('button', { name: 'Download the skill' })
        .click(),
    );
    expect(fromGuide.name).toBe('sequence-walkthrough-skill-kit.zip');
    await expect(stepInput(page)).toBeHidden();
  });
});
