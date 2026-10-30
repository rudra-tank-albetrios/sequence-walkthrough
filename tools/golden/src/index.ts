// Golden files for the parser (plan section 7.1).
//
// Runs the version 2 parser (src/js/core.js, built into dist/index.html by build.py) in a real
// browser on every fixture in packages/core/fixtures, and saves what it produced next to the
// fixture as <name>.golden.json. The version 3 parser in packages/core must reproduce these files;
// any difference is a recorded bug fix.
//
//   python build.py
//   node tools/golden/src/index.ts            # all fixtures
//   node tools/golden/src/index.ts oauth      # fixtures whose name contains "oauth"
//
// Needs the Playwright Chromium browser and network access (the version 2 page loads Mermaid from a
// CDN). It is a one-off tool for the migration, not part of `npm run verify`.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium } from '@playwright/test';
import { repoRoot } from '@swv/tool-kit';

interface Golden {
  fixture: string;
  /** What version 2's Annotations.parse returned. */
  annotations: unknown;
  /** What version 2 read out of Mermaid's own parse, or the message when Mermaid refused the code. */
  mermaid: { info: unknown } | { error: string };
  /** What version 2's buildFlow returned (with Mermaid's info when it had one). */
  flow: unknown;
}

const fixturesDir = resolve(repoRoot, 'packages/core/fixtures');
const viewer = resolve(repoRoot, 'dist/index.html');
const filter = process.argv[2] ?? '';

const fixtures = readdirSync(fixturesDir)
  .filter((name) => name.endsWith('.mmd') && name.includes(filter))
  .sort();
if (fixtures.length === 0) {
  console.error(`golden: no fixtures matching "${filter}" in ${fixturesDir}`);
  process.exit(1);
}

// The version 2 page loads Mermaid from a CDN, which a headless page opened from disk cannot reach
// reliably. Fetch the same pinned build here and hand it to the page before its own scripts run.
const MERMAID_URL = 'https://cdn.jsdelivr.net/npm/mermaid@12.2.0/dist/mermaid.min.js';
const mermaidResponse = await fetch(MERMAID_URL);
if (!mermaidResponse.ok) throw new Error(`Could not download Mermaid: ${mermaidResponse.status}`);
const mermaidSource = await mermaidResponse.text();

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (error) => {
  console.error(`page error: ${error.stack ?? error.message}`);
});
page.on('console', (message) => {
  if (message.type() === 'error') console.error(`console error: ${message.text()}`);
});
await page.route('**/mermaid@12.2.0/dist/mermaid.min.js', (route) =>
  route.fulfill({ body: mermaidSource, contentType: 'application/javascript' }),
);
await page.goto(pathToFileURL(viewer).href, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => typeof (globalThis as { mermaid?: unknown }).mermaid !== 'undefined',
  undefined,
  { timeout: 30_000 },
);
// Version 2's parser, as committed, loaded as a plain script so its top-level names are globals.
await page.addScriptTag({ content: readFileSync(resolve(repoRoot, 'src/js/core.js'), 'utf8') });

for (const name of fixtures) {
  const code = readFileSync(resolve(fixturesDir, name), 'utf8');
  // The page's own scripts are wrapped in a function by build.py, so the version 2 parser is
  // loaded a second time as a plain script (see above) and its top-level names are reached
  // directly. The in-page code is a string because those names do not exist for TypeScript.
  const golden = await page.evaluate<Omit<Golden, 'fixture'>>(
    `(async (source) => {
      const annotations = Annotations.parse(source);
      let result;
      let info = null;
      try {
        const diagram = await mermaid.mermaidAPI.getDiagramFromText(source);
        info = /^sequenceDiagram$/i.test(annotations.diagramType) ? mermaidInfo(diagram) : null;
        result = { info };
      } catch (error) {
        result = { error: error instanceof Error ? error.message : String(error) };
      }
      const flow = buildFlow(annotations, info);
      // Drop the step token cache: it is a UI memo, not parser output.
      return JSON.parse(JSON.stringify({ annotations, mermaid: result, flow }, (key, value) =>
        key === '_tok' ? undefined : value));
    })(${JSON.stringify(code)})`,
  );
  const out = resolve(fixturesDir, name.replace(/\.mmd$/, '.golden.json'));
  writeFileSync(out, `${JSON.stringify({ fixture: name, ...golden }, null, 2)}\n`);
  const status = 'error' in golden.mermaid ? `mermaid error: ${golden.mermaid.error}` : 'ok';
  console.log(`${name}: ${status}`);
}

await browser.close();
