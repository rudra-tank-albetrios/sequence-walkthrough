// The check to run before merging, now that pull requests have no CI: `npm run check`.
// Types, lint, unit tests and the build, then the built site is opened in one browser to prove the
// demo flow draws. The fuller suites stay available by hand through `npm run verify`.
import { spawn, spawnSync } from 'node:child_process';

import { chromium } from '@playwright/test';

const PORT = Number(process.env.SWV_E2E_PORT ?? 4173);
const URL = `http://127.0.0.1:${PORT}/`;
const STEPS = ['typecheck', 'lint', 'test', 'build', 'check:budgets'];

for (const step of STEPS) {
  console.warn(`\n== npm run ${step}`);
  const { status } = spawnSync('npm', ['run', step], { stdio: 'inherit', shell: true });
  if (status !== 0) {
    console.error(`\nFAILED: npm run ${step}`);
    process.exit(1);
  }
}

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const up = await fetch(URL).then(
      (response) => response.ok,
      () => false,
    );
    if (up) return;
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(`The preview server did not answer at ${URL}`);
}

async function checkPage(): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('diagram').locator('svg').first().waitFor({ timeout: 60_000 });
    if (errors.length > 0) throw new Error(`The page threw: ${errors.join('; ')}`);
  } finally {
    await browser.close();
  }
}

console.warn('\n== open the built site');
const server = spawn(
  'npm',
  [
    'run',
    '-w',
    '@swv/web',
    'preview',
    '--',
    '--host',
    '127.0.0.1',
    '--port',
    `${PORT}`,
    '--strictPort',
  ],
  { stdio: 'ignore', shell: true },
);
let failure: string | undefined;
try {
  await waitForServer();
  await checkPage();
} catch (error) {
  failure = error instanceof Error ? error.message : 'Unknown error';
}
if (process.platform === 'win32') {
  spawnSync('taskkill', ['/pid', `${server.pid}`, '/T', '/F'], { stdio: 'ignore' });
} else {
  server.kill();
}
if (failure) {
  console.error(`\nFAILED: open the built site\n${failure}`);
  process.exit(1);
}
console.warn('\nAll basic checks passed.');
process.exit(0);
