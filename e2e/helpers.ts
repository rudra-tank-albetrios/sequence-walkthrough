import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

// What the parity specs share. Page scripts cast `globalThis` by hand: this project has no DOM lib.

const root = resolve(import.meta.dirname, '..');

export const DEMO_TITLE = 'Place an order';
export const DEMO_STEPS = 42;
export const DEMO_NOTES_KEY = `swv:notes:t:${DEMO_TITLE}`;

export const demoFlow = (): string =>
  readFileSync(resolve(root, 'examples/demo-store/flows/place-order.mmd'), 'utf8');

export const fixture = (name: string): string =>
  readFileSync(resolve(root, `packages/core/fixtures/${name}.mmd`), 'utf8');

export const diagram = (page: Page) => page.getByTestId('diagram');
export const svg = (page: Page) => diagram(page).locator('svg').first();
export const stepInput = (page: Page) => page.getByLabel('Step number, type to jump');
export const toastBox = (page: Page) => page.getByTestId('toast');
export const notice = (page: Page) => page.getByTestId('notice');
export const heading = (page: Page) => page.getByRole('heading', { level: 1 });

interface OpenOptions {
  /** Diagram code to open instead of the demo flow, as if version 2 had autosaved it. */
  code?: string;
  /** Raw localStorage values (key to JSON text), written once before the first page load. */
  storage?: Record<string, string>;
  /** The URL fragment, with its `#`. */
  hash?: string;
  /** Replace the clipboard with a recorder (see `copied`). */
  clipboard?: boolean;
}

let seeds = 0;

/** Writes localStorage once, so a later reload shows what the page itself saved. */
export async function seed(page: Page, entries: Record<string, string>): Promise<void> {
  seeds += 1;
  await page.addInitScript(
    ({ flag, values }) => {
      if (sessionStorage.getItem(flag)) return;
      sessionStorage.setItem(flag, '1');
      for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
    },
    { flag: `swv-test-seeded-${seeds}`, values: entries },
  );
}

/** The clipboard API differs per browser and needs a permission in some: tests read a recorder. */
export async function recordClipboard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const scope = globalThis as unknown as { swvCopied: string[]; navigator: object };
    scope.swvCopied = [];
    Object.defineProperty(scope.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) => {
          scope.swvCopied.push(text);
          return Promise.resolve();
        },
      },
    });
  });
}

/** What the page last wrote to the recorded clipboard. */
export const copied = (page: Page): Promise<string> =>
  page.evaluate(() => (globalThis as unknown as { swvCopied: string[] }).swvCopied.at(-1) ?? '');

/** Opens the viewer and waits for the drawing. */
export async function open(page: Page, options: OpenOptions = {}): Promise<void> {
  const storage = { ...options.storage };
  if (options.code !== undefined) storage['swv:code'] = JSON.stringify(options.code);
  if (Object.keys(storage).length > 0) await seed(page, storage);
  if (options.clipboard) await recordClipboard(page);
  await page.goto(`/${options.hash ?? ''}`);
  await expect(svg(page)).toBeVisible({ timeout: 30_000 });
}

/** Opens the viewer and gives the canvas the keyboard, without landing on an arrow. */
export async function openFocused(page: Page, options: OpenOptions = {}): Promise<void> {
  await open(page, options);
  await diagram(page).focus();
}

/** Jumps to a 1-based step with the number box, then gives the keyboard back to the canvas. */
export async function goToStep(page: Page, n: number): Promise<void> {
  if (!(await stepInput(page).isVisible())) await page.keyboard.press('ArrowRight');
  await stepInput(page).fill(String(n));
  await stepInput(page).press('Enter');
  await expect(stepInput(page)).toHaveValue(String(n));
  await diagram(page).focus();
}

interface DomRange {
  setStart: (node: unknown, offset: number) => void;
  setEnd: (node: unknown, offset: number) => void;
  getBoundingClientRect: () => { x: number; y: number; width: number; height: number };
}

interface DomScope {
  document: {
    createRange: () => DomRange;
    createTreeWalker: (
      root: unknown,
      show: number,
    ) => { nextNode: () => { nodeValue: string | null } | null };
  };
  getSelection: () => { removeAllRanges: () => void; addRange: (range: DomRange) => void };
}

/** Selects the first occurrence of a word inside an element and right-clicks it. */
export async function rightClickWord(page: Page, testId: string, word: string): Promise<void> {
  const box = await page.getByTestId(testId).evaluate((el, target) => {
    const scope = globalThis as unknown as DomScope;
    const walker = scope.document.createTreeWalker(el, 4);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = (node.nodeValue ?? '').indexOf(target);
      if (at < 0) continue;
      const range = scope.document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + target.length);
      const selection = scope.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      const { x, y, width, height } = range.getBoundingClientRect();
      return { x, y, width, height };
    }
    throw new Error(`No "${target}" in the element`);
  }, word);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
}

export interface CameraState {
  x: number;
  y: number;
  k: number;
}

/** The camera, read from the transform on the diagram's layer. */
export async function camera(page: Page): Promise<CameraState> {
  const transform = await page
    .getByTestId('layer')
    .evaluate((el) => (el as unknown as { style: { transform: string } }).style.transform);
  const match = /translate\(([-\d.e]+)px,\s*([-\d.e]+)px\)\s*scale\(([-\d.e]+)\)/.exec(transform);
  if (!match) throw new Error(`Unexpected camera transform: ${transform}`);
  return { x: Number(match[1]), y: Number(match[2]), k: Number(match[3]) };
}

export interface SavedFile {
  name: string;
  bytes: Buffer;
  text: string;
}

/** Runs the action and returns the file it downloads. */
export async function download(page: Page, action: () => Promise<void>): Promise<SavedFile> {
  const [file] = await Promise.all([page.waitForEvent('download'), action()]);
  const bytes = readFileSync(await file.path());
  return { name: file.suggestedFilename(), bytes, text: bytes.toString('utf8') };
}

/** Axe with the WCAG 2.1 A and AA rules over the whole page. */
export async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
  ).toEqual([]);
}
