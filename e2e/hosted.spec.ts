import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import {
  expectInjectedScriptsStopped,
  expectV2LinkOpen,
  openGuide,
  readPolicy,
  V2_FRAGMENT,
  watchPage,
} from './cutover-support.ts';
import { svg } from './helpers.ts';

// The website as GitHub Pages serves it: its policy, its address, and the links people already have.

const SITE = resolve(import.meta.dirname, '../apps/web/dist');
const LIVE_ORIGIN = 'https://rudra-tank-albetrios.github.io';
const LIVE_PATH = '/sequence-walkthrough/';

test.describe('hosted build', () => {
  test.skip(
    Boolean(process.env.SWV_E2E_URL),
    'The policy and the zips are only in a production build, not on a dev server.',
  );

  test('has the strict policy and no inline script', async ({ page }) => {
    await page.goto('/');
    const policy = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute('content');
    expect(Object.fromEntries(readPolicy(policy))).toEqual({
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'blob:'],
      'font-src': ["'self'", 'data:'],
      'connect-src': ["'self'", 'https:', 'http://localhost:*', 'http://127.0.0.1:*'],
      'object-src': ["'none'"],
      'base-uri': ["'none'"],
      'form-action': ["'none'"],
    });
    // Every script is a file of this site, or the policy above would block it.
    const html = readFileSync(resolve(SITE, 'index.html'), 'utf8');
    const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((match) => match[0]);
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) expect(script).toMatch(/\ssrc="\.\/assets\//);
  });

  test('its policy stops a script added to the page', async ({ page }) => {
    await page.goto('/');
    await expect(svg(page)).toBeVisible({ timeout: 30_000 });
    await expectInjectedScriptsStopped(page);
  });

  /** Answers the live address from the build, and refuses everything else. */
  async function serveAtLiveAddress(page: Page, asked: string[]): Promise<void> {
    await page.route('**/*', async (route) => {
      const { origin, pathname } = new URL(route.request().url());
      asked.push(pathname);
      if (origin !== LIVE_ORIGIN || !pathname.startsWith(LIVE_PATH)) {
        await route.abort();
        return;
      }
      const file = pathname.slice(LIVE_PATH.length) || 'index.html';
      await route.fulfill({ path: resolve(SITE, file) });
    });
  }

  for (const entry of ['', 'index.html']) {
    test(`a version 2 link opens at the live address${entry ? ` with ${entry}` : ''}`, async ({
      page,
    }) => {
      const watch = watchPage(page);
      const asked: string[] = [];
      await serveAtLiveAddress(page, asked);
      await page.goto(`${LIVE_ORIGIN}${LIVE_PATH}${entry}${V2_FRAGMENT}&step=2`);
      await expectV2LinkOpen(page);
      expect(watch.errors).toEqual([]);
      // Every file comes from under the site's folder: the build's links are all relative.
      expect(asked.filter((path) => !path.startsWith(LIVE_PATH))).toEqual([]);
    });
  }

  for (const file of [
    'sequence-walkthrough.zip',
    'sequence-walkthrough-skill-kit.zip',
    'sequence-walkthrough-one-file.zip',
  ]) {
    test(`${file} is published next to the page`, async ({ request }) => {
      const response = await request.get(`/${file}`);
      expect(response.status()).toBe(200);
      expect((await response.body()).subarray(0, 2).toString('latin1')).toBe('PK');
    });
  }

  test('the one-file zip holds the two pages', async ({ request }) => {
    const zip = await (await request.get('/sequence-walkthrough-one-file.zip')).body();
    // File names are stored as plain text in a zip.
    const names = zip.toString('latin1');
    expect(names).toContain('sequence-walkthrough.html');
    expect(names).toContain('sequence-viewer.html');
    expect(names).toContain('README.txt');
  });

  test('the one-file pages themselves are not on the website', () => {
    // The artifact page has no policy of its own, so it must not share the site's origin and keys.
    expect(existsSync(resolve(SITE, 'sequence-viewer.html'))).toBe(false);
    expect(existsSync(resolve(SITE, 'sequence-walkthrough.html'))).toBe(false);
  });

  test('the guide links to the one-file zip', async ({ page }) => {
    await page.goto('/');
    await expect(svg(page)).toBeVisible({ timeout: 30_000 });
    const guide = await openGuide(page);
    await expect(guide.getByRole('link', { name: 'download it as one file' })).toHaveAttribute(
      'href',
      './sequence-walkthrough-one-file.zip',
    );
  });
});
