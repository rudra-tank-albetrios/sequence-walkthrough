import { expect, type Locator, type Page } from '@playwright/test';

import { DEMO_TITLE, heading, svg } from './helpers.ts';

// Shared by the checks on the website and the one-file build (docs/decisions.md, phase 4).

/**
 * A link made by the real version 2 page (commit 398d08e, the code path of `Exporter.share`) for a
 * three-step flow whose first step says "résumé". People keep these links in their chats, so they
 * must go on opening. The website and the one-file page both read it.
 */
export const V2_FRAGMENT =
  '#z.eJx1jkFuwjAQRfec4m9YBhDLLKJWpkKoCxbhAm4yxVaMnc5M4l6Jc3CxqkYqC9T10__vCX1NFDvaeXtme1kAwHKJFxmpQ7ZhUMdpOrv19g-p10A4hh7iLBOCj0OBo2X1nR9tVBhYgQmeoj6x9pe1xDPxw6c04uQIXdnAyiD4TAx1hMQ9sawKz4l78O0q0-V2xchpJkFMsXptzeEApW-FTDz7mWRV7k3VNG2N_dsJ6_vTs1VKDWyUTCzIXl0xBy96f2mrqmlMje1mg-P7v9092yxlqvYj0KPA1NixzQ-0-AFOKXdD';
export const V2_TITLE = 'Old share link';

export interface PageWatch {
  /** Uncaught errors and console errors. A policy violation is a console error. */
  errors: string[];
  /** Every URL the page asked for. */
  requests: string[];
}

export function watchPage(page: Page): PageWatch {
  const watch: PageWatch = { errors: [], requests: [] };
  page.on('pageerror', (error) => watch.errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') watch.errors.push(message.text());
  });
  page.on('request', (request) => watch.requests.push(request.url()));
  return watch;
}

/** Requests for anything but `own` (the page itself) and what the page holds in data: and blob: URLs. */
export const requestsBeyond = (watch: PageWatch, own: string): string[] =>
  watch.requests.filter(
    (url) => !url.startsWith('data:') && !url.startsWith('blob:') && url.split('#')[0] !== own,
  );

export const stepAnnouncement = (page: Page): Locator => page.getByTestId('live');

/** The demo flow opens, its diagram is drawn, and the arrow keys move between steps. */
export async function expectDemoWalk(page: Page): Promise<void> {
  await expect(heading(page)).toHaveText(DEMO_TITLE);
  await expect(svg(page)).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press('ArrowRight');
  await expect(stepAnnouncement(page)).toHaveText(/^Step 1 of \d+\./);
  await page.keyboard.press('ArrowRight');
  await expect(stepAnnouncement(page)).toHaveText(/^Step 2 of \d+\./);
  await page.keyboard.press('ArrowLeft');
  await expect(stepAnnouncement(page)).toHaveText(/^Step 1 of \d+\./);
  await expect(svg(page).locator('.swv-cur').first()).toBeAttached();
}

/** The version 2 link's flow is open on its step, with its non-ASCII text intact. */
export async function expectV2LinkOpen(page: Page): Promise<void> {
  await expect(heading(page)).toHaveText(V2_TITLE);
  await expect(svg(page)).toBeVisible({ timeout: 30_000 });
  await expect(stepAnnouncement(page)).toHaveText(/^Step 2 of 3\./);
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('step-card')).toContainText('résumé');
}

/** A policy as directive name to its sources, so a test states exactly what each one allows. */
export function readPolicy(text: string | null | undefined): Map<string, string[]> {
  const policy = new Map<string, string[]>();
  for (const directive of (text ?? '').split(';')) {
    const [name, ...sources] = directive.trim().split(/\s+/);
    if (name) policy.set(name, sources);
  }
  return policy;
}

/** Adds an inline script and a remote one: a working policy stops both and reports both. */
export async function expectInjectedScriptsStopped(page: Page): Promise<void> {
  await page.evaluate(`(() => {
    window.__violations = 0;
    document.addEventListener('securitypolicyviolation', () => { window.__violations += 1; });
    const inline = document.createElement('script');
    inline.textContent = 'window.__injected = true';
    document.head.append(inline);
    const remote = document.createElement('script');
    remote.src = 'https://injected.invalid/x.js';
    document.head.append(remote);
  })()`);
  await expect.poll(() => page.evaluate<number>('window.__violations')).toBeGreaterThanOrEqual(2);
  expect(await page.evaluate<boolean>('window.__injected === true')).toBe(false);
}

/** The guide: its own button, or an item of the ⋯ menu on narrow screens. */
export async function openGuide(page: Page): Promise<Locator> {
  const more = page.getByRole('button', { name: 'More', exact: true });
  if (await more.isVisible()) {
    await more.click();
    await page.getByRole('menuitem', { name: 'How it works' }).click();
  } else {
    await page.getByRole('button', { name: 'How it works' }).click();
  }
  const dialog = page.getByRole('dialog', { name: 'How it works' });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** The export items: on the Export button, or in the ⋯ menu on narrow screens. */
export async function openExportItems(page: Page): Promise<Locator> {
  const more = page.getByRole('button', { name: 'More', exact: true });
  await ((await more.isVisible()) ? more : page.getByRole('button', { name: /^Export/ })).click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  return menu;
}
