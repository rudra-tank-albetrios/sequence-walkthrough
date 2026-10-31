import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';

import { expect, test, type Page } from '@playwright/test';

import {
  expectDemoWalk,
  expectInjectedScriptsStopped,
  expectV2LinkOpen,
  openExportItems,
  openGuide,
  readPolicy,
  requestsBeyond,
  V2_FRAGMENT,
  watchPage,
} from './cutover-support.ts';
import { download, svg, type SavedFile } from './helpers.ts';

// The one-file build (`npm run build`): the page to open from disk and the page for a Claude artifact.

const BUILD = resolve(import.meta.dirname, '../apps/web/dist-single');
const PAGE_FILE = resolve(BUILD, 'sequence-walkthrough.html');
const PAGE_URL = pathToFileURL(PAGE_FILE).href;

const linkTo = (code: string): string => `#z.${deflateSync(code).toString('base64url')}`;

test.describe('one-file page, opened from disk', () => {
  test('loads the demo flow, draws it and moves between steps, with no errors and no network', async ({
    page,
  }) => {
    const watch = watchPage(page);
    await page.goto(PAGE_URL);
    await expectDemoWalk(page);
    // Nothing is left to fetch: no script, stylesheet or font file outside the page.
    const outside = await page.evaluate<number>(
      `document.querySelectorAll('script[src], link[rel="stylesheet"], link[rel="modulepreload"]').length`,
    );
    expect(outside).toBe(0);
    const fonts = await page.evaluate<number>(
      `document.fonts.load('16px "Recursive"').then((faces) => faces.length)`,
    );
    expect(fonts).toBeGreaterThan(0);
    expect(watch.errors).toEqual([]);
    expect(requestsBeyond(watch, PAGE_URL)).toEqual([]);
  });

  test('opens a link made by version 2, on its step', async ({ page }) => {
    const watch = watchPage(page);
    await page.goto(`${PAGE_URL}${V2_FRAGMENT}&step=2`);
    await expectV2LinkOpen(page);
    expect(watch.errors).toEqual([]);
    expect(requestsBeyond(watch, PAGE_URL)).toEqual([]);
  });

  for (const code of [
    'flowchart TD\n  A[Start] --> B[End]\n',
    'classDiagram\n  class Start\n',
    'stateDiagram-v2\n  [*] --> Start\n',
  ]) {
    test(`draws ${code.split('\n')[0]} with its labels, from code inside the page`, async ({
      page,
    }) => {
      const watch = watchPage(page);
      await page.goto(`${PAGE_URL}${linkTo(code)}`);
      await expect(svg(page)).toBeVisible({ timeout: 30_000 });
      await expect(svg(page)).toContainText('Start');
      expect(watch.errors).toEqual([]);
      expect(requestsBeyond(watch, PAGE_URL)).toEqual([]);
    });
  }

  test('saves an SVG with its fonts, a PDF and the skill kit from inside the page', async ({
    page,
  }) => {
    const watch = watchPage(page);
    await page.goto(PAGE_URL);
    await expect(svg(page)).toBeVisible({ timeout: 30_000 });

    const saved = async (item: RegExp): Promise<SavedFile> => {
      const menu = await openExportItems(page);
      return download(page, () => menu.getByRole('menuitem', { name: item }).click());
    };

    const image = await saved(/^SVG/);
    expect(image.name).toBe('Place an order.svg');
    expect(image.text).toContain('@font-face');
    expect(image.text).toContain('url(data:font/woff2;base64,');

    const kit = await saved(/^Download the skill/);
    expect(kit.name).toBe('sequence-walkthrough-skill-kit.zip');
    expect(kit.bytes.subarray(0, 2).toString('latin1')).toBe('PK');

    const menu = await openExportItems(page);
    await menu.getByRole('menuitem', { name: /^PDF/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Download PDF' });
    const pdf = await download(page, () =>
      dialog.getByRole('button', { name: /^Download / }).click(),
    );
    expect(pdf.name).toBe('Place an order.pdf');
    expect(pdf.bytes.subarray(0, 4).toString('latin1')).toBe('%PDF');

    expect(watch.errors).toEqual([]);
    expect(requestsBeyond(watch, PAGE_URL)).toEqual([]);
  });

  test('has its own strict policy, allowing only the hash of its one script', () => {
    const html = readFileSync(PAGE_FILE, 'utf8');
    const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html);
    const open = /<script type="module"[^>]*>/.exec(html);
    if (!meta?.[1] || !open) throw new Error('the page has no policy or no script');
    expect(meta.index).toBeLessThan(open.index);
    expect(html.indexOf('<meta charset="utf-8"')).toBeLessThan(1024);

    const start = open.index + open[0].length;
    const code = html.slice(start, html.indexOf('</script>', start));
    const hash = createHash('sha256').update(code, 'utf8').digest('base64');
    expect(Object.fromEntries(readPolicy(meta[1]))).toEqual({
      'default-src': ["'none'"],
      'script-src': [`'sha256-${hash}'`],
      'style-src': ["'unsafe-inline'"],
      'img-src': ['data:', 'blob:'],
      'font-src': ['data:'],
      'connect-src': ['https:', 'http://localhost:*', 'http://127.0.0.1:*'],
      'base-uri': ["'none'"],
      'form-action': ["'none'"],
    });
  });

  test('its policy stops a script added to the page', async ({ page }) => {
    await page.goto(PAGE_URL);
    await expect(svg(page)).toBeVisible({ timeout: 30_000 });
    await expectInjectedScriptsStopped(page);
  });

  test('does not offer the zip it came in', async ({ page }) => {
    await page.goto(PAGE_URL);
    await expect(svg(page)).toBeVisible({ timeout: 30_000 });
    const guide = await openGuide(page);
    await expect(guide.getByRole('link', { name: 'download it as one file' })).toHaveCount(0);
  });
});

// The artifact page, in the document skeleton the Artifact tool wraps a page in, with the
// `window.claude` runtime contract stubbed. What a host really does cannot be tested without one.
const HOST_URL = 'https://artifact.test/';
const HOST_SKELETON = (content: string): string =>
  `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>*,*::before,*::after{box-sizing:border-box}html,body{margin:0}</style></head><body>${content}</body></html>`;
// As strict as a host could be and still run a page: inline code only, nothing from anywhere else.
const HOST_POLICY =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:";
// `use` resolves a namespace or null; `save` refuses the extensions the real allowlist refuses.
const HOST_STUB = `
  window.__host = { sampled: [], saved: [], copied: [] };
  window.claude = {
    use: async (name) => {
      if (name === 'sample') {
        return async (messages, options) => {
          window.__host.sampled.push({ messages, options });
          return { text: 'Answer from the host.', truncated: false };
        };
      }
      if (name === 'downloads') {
        return {
          save: async ({ filename, data }) => {
            if (!/\\.(txt|json|md|csv|svg|pdf|png|zip)$/.test(filename)) {
              throw { code: 'rejected_extension', message: 'That extension cannot be saved.' };
            }
            window.__host.saved.push({ filename, size: data.size });
            return { status: 'saved' };
          },
        };
      }
      return null;
    },
  };
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: async (text) => { window.__host.copied.push(text); } },
  });
`;

async function openInHost(page: Page, extraScript = ''): Promise<void> {
  const fragment = readFileSync(resolve(BUILD, 'sequence-viewer.html'), 'utf8');
  await page.addInitScript({ content: HOST_STUB + extraScript });
  await page.route('**/*', async (route) => {
    if (route.request().url().split('#')[0] !== HOST_URL) {
      await route.abort();
      return;
    }
    await route.fulfill({
      contentType: 'text/html; charset=utf-8',
      headers: { 'Content-Security-Policy': HOST_POLICY },
      body: HOST_SKELETON(fragment),
    });
  });
  await page.goto(HOST_URL);
}

test.describe('one-file page, published as a Claude artifact', () => {
  test('has no document skeleton and no policy of its own, as version 2 built it', () => {
    const fragment = readFileSync(resolve(BUILD, 'sequence-viewer.html'), 'utf8');
    expect(fragment.startsWith('<title>Sequence Walkthrough</title>')).toBe(true);
    const beforeScript = fragment.slice(0, fragment.indexOf('<script type="module">'));
    expect(beforeScript).toContain('<style>');
    expect(beforeScript).toContain('<div id="root"></div>');
    for (const tag of ['<!doctype', '<html', '<head', '<body', '<meta charset', 'http-equiv']) {
      expect(beforeScript.toLowerCase()).not.toContain(tag);
    }
  });

  test('runs in the host, with no errors and nothing fetched', async ({ page }) => {
    const watch = watchPage(page);
    await openInHost(page);
    await expectDemoWalk(page);
    expect(watch.errors).toEqual([]);
    expect(requestsBeyond(watch, HOST_URL)).toEqual([]);
  });

  test('still works when the host blocks browser storage', async ({ page }) => {
    const watch = watchPage(page);
    await openInHost(
      page,
      `for (const name of ['localStorage', 'sessionStorage']) {
        Object.defineProperty(window, name, {
          get() { throw new DOMException('Blocked in this view', 'SecurityError'); },
        });
      }`,
    );
    await expectDemoWalk(page);
    expect(watch.errors).toEqual([]);
  });

  test('Ask AI answers through the host, on the Claude provider', async ({ page }) => {
    const watch = watchPage(page);
    await openInHost(
      page,
      `localStorage.setItem('swv:ai', JSON.stringify({
        provider: 'claude', keys: {}, models: {}, customUrl: '',
        includePayload: true, autoNote: true, mode: 'project',
      }));`,
    );
    await expect(svg(page)).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('a');
    const dialog = page.getByRole('dialog', { name: 'Ask AI about step 1' });
    await dialog.getByRole('button', { name: 'Why this step?' }).click();
    await expect(dialog.getByText('Answer from the host.')).toBeVisible();

    const sampled =
      await page.evaluate<{ messages: { role: string; content: string }[]; options: unknown }[]>(
        'window.__host.sampled',
      );
    expect(sampled).toHaveLength(1);
    expect(sampled[0]?.messages[0]?.role).toBe('user');
    expect(sampled[0]?.options).toEqual({ modelTier: 'quick', cache: false });
    expect(watch.errors).toEqual([]);
    expect(requestsBeyond(watch, HOST_URL)).toEqual([]);
  });

  test('files go through the downloads capability and share links are only the fragment', async ({
    page,
  }) => {
    const watch = watchPage(page);
    await openInHost(page);
    await expect(svg(page)).toBeVisible({ timeout: 30_000 });

    const pick = async (item: RegExp) => {
      const menu = await openExportItems(page);
      await menu.getByRole('menuitem', { name: item }).click();
    };

    await pick(/^SVG/);
    await expect(page.getByRole('status').filter({ hasText: 'Saved ' })).toBeVisible();
    // The real host refuses .mmd, so the same text is saved as .txt.
    await pick(/^Code/);
    await page.getByRole('button', { name: 'Save as .txt' }).click();
    await expect
      .poll(() => page.evaluate<string[]>('window.__host.saved.map((file) => file.filename)'))
      .toEqual(['Place an order.svg', 'Place an order.mmd.txt']);

    await pick(/^Copy viewer link/);
    await expect(
      page.getByRole('status').filter({ hasText: 'Copied the code fragment' }),
    ).toBeVisible();
    const copied = await page.evaluate<string[]>('window.__host.copied');
    expect(copied).toHaveLength(1);
    expect(copied[0]).toMatch(/^#z\.[A-Za-z0-9_-]+$/);

    expect(watch.errors).toEqual([]);
    expect(requestsBeyond(watch, HOST_URL)).toEqual([]);
  });
});
