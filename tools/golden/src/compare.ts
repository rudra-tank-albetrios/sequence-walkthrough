// Screenshots of the version 2 page and the version 3 app on the same flow (plan section 7.2).
//
//   python build.py                                   # the version 2 page in dist/index.html
//   node tools/golden/src/compare.ts http://127.0.0.1:5173/ [flow.mmd]
//
// Writes tmp/compare/<old|new>-<light|dark|phone>-<overview|step5>.png. Needs the Playwright Chromium
// browser; Mermaid for the old page is fetched from the CDN in Node, as tools/golden does.
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';

import { chromium, type Page } from '@playwright/test';
import { repoRoot } from '@swv/tool-kit';

const newUrl = process.argv[2];
if (!newUrl) {
  console.error('usage: node tools/golden/src/compare.ts <new app url> [flow.mmd]');
  process.exit(1);
}
const flowPath = resolve(repoRoot, process.argv[3] ?? 'examples/demo-store/flows/place-order.mmd');
const code = readFileSync(flowPath, 'utf8');
const outDir = resolve(repoRoot, 'tmp/compare');
mkdirSync(outDir, { recursive: true });

const base64url = (bytes: Uint8Array) =>
  Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fragment = `#z.${base64url(deflateSync(Buffer.from(code, 'utf8')))}`;

const MERMAID_URL = 'https://cdn.jsdelivr.net/npm/mermaid@12.2.0/dist/mermaid.min.js';
const mermaidSource = await (await fetch(MERMAID_URL)).text();

const SIZES = {
  light: { width: 1280, height: 800, dark: false },
  dark: { width: 1280, height: 800, dark: true },
  phone: { width: 390, height: 844, dark: false },
} as const;

const browser = await chromium.launch();

async function shoot(page: Page, name: string) {
  await page.screenshot({ path: resolve(outDir, `${name}.png`), fullPage: false });
  console.log(`wrote ${name}.png`);
}

for (const [sizeName, size] of Object.entries(SIZES)) {
  // Version 2
  const oldContext = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    colorScheme: size.dark ? 'dark' : 'light',
  });
  const oldPage = await oldContext.newPage();
  await oldPage.route('**/mermaid@12.2.0/dist/mermaid.min.js', (route) =>
    route.fulfill({ body: mermaidSource, contentType: 'application/javascript' }),
  );
  await oldPage.goto(`${pathToFileURL(resolve(repoRoot, 'dist/index.html')).href}${fragment}`, {
    waitUntil: 'domcontentloaded',
  });
  await oldPage.waitForFunction(
    () => (globalThis as { SWV?: { S: { rendered: boolean } } }).SWV?.S.rendered === true,
    undefined,
    { timeout: 60_000 },
  );
  await oldPage.waitForTimeout(500);
  await shoot(oldPage, `old-${sizeName}-overview`);
  await oldPage.evaluate(() => {
    (globalThis as unknown as { SWV: { Walk: { go: (i: number) => void } } }).SWV.Walk.go(4);
  });
  await oldPage.waitForTimeout(600);
  await shoot(oldPage, `old-${sizeName}-step5`);
  await oldContext.close();

  // Version 3
  const newContext = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    colorScheme: size.dark ? 'dark' : 'light',
  });
  const newPage = await newContext.newPage();
  await newPage.goto(`${newUrl}${fragment}`, { waitUntil: 'domcontentloaded' });
  await newPage.getByTestId('diagram').locator('svg').first().waitFor({ timeout: 60_000 });
  await newPage.waitForTimeout(500);
  await shoot(newPage, `new-${sizeName}-overview`);
  // A hash-only change would not reload the page, so leave it first.
  await newPage.goto('about:blank');
  await newPage.goto(`${newUrl}${fragment}&step=5`, { waitUntil: 'domcontentloaded' });
  await newPage.getByTestId('diagram').locator('svg .swv-cur').first().waitFor({ timeout: 60_000 });
  await newPage.waitForTimeout(600);
  await shoot(newPage, `new-${sizeName}-step5`);
  await newContext.close();
}

await browser.close();
