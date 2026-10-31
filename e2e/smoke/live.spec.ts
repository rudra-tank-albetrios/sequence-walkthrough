import { deflateSync } from 'node:zlib';

import { expect, test } from '@playwright/test';

import { firstTimeVisitor } from '../visitors.ts';

// Run after every deployment (plan section 1, rule 8). A fresh browser profile, so the demo flow opens.

const CODE = `sequenceDiagram
    %% @title Smoke test link
    participant C as Client
    participant S as Server
    %% @step The client asks.
    C->>S: GET /orders
    %% @step The server answers.
    S-->>C: 200 OK
`;

test('the live site opens the demo flow, draws it and moves between steps', async ({
  page,
  baseURL,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto(baseURL ?? '/', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle(/Sequence Walkthrough/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Place an order');
  await expect(page.getByTestId('diagram').locator('svg').first()).toBeVisible({
    timeout: 60_000,
  });
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('live')).toHaveText(/^Step 1 of \d+\./);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('live')).toHaveText(/^Step 2 of \d+\./);

  // The site serves its scripts itself and never allows inline ones (plan section 4).
  const policy = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(policy).toContain("script-src 'self';");

  expect(errors).toEqual([]);
});

test('a share link opens that flow on its step', async ({ page, baseURL }) => {
  // The format version 2 wrote, so links people already have keep working.
  const fragment = `#z.${deflateSync(CODE).toString('base64url')}&step=2`;
  await page.goto(`${baseURL ?? '/'}${fragment}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Smoke test link');
  await expect(page.getByTestId('live')).toHaveText(/^Step 2 of 2\./);
});

test('the downloads are published next to the page', async ({ request, baseURL }) => {
  for (const file of [
    'sequence-walkthrough.zip',
    'sequence-walkthrough-skill-kit.zip',
    'sequence-walkthrough-one-file.zip',
  ]) {
    const response = await request.get(new URL(file, baseURL).href);
    expect(response.status(), file).toBe(200);
    expect((await response.body()).subarray(0, 2).toString('latin1'), file).toBe('PK');
  }
});

test.describe('a first-time visitor on the live site', () => {
  test.use({ storageState: firstTimeVisitor });

  test('gets the demo flow and the tour, and no error', async ({ page, baseURL }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(baseURL ?? '/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('tour-card')).toHaveAttribute('data-stop', 'layers', {
      timeout: 60_000,
    });
    // The page behind the card is hidden from the accessibility tree, so this looks for the tag.
    await expect(page.locator('h1')).toHaveText('Place an order');
    await expect(page.getByTestId('diagram').locator('svg').first()).toBeVisible();

    expect(pageErrors).toEqual([]);
  });
});
