import { expect, test } from '@playwright/test';

test('the live site opens and renders a diagram', async ({ page, baseURL }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(baseURL ?? '/', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle(/Sequence Walkthrough/);
  // Version 2 draws into #canvas; version 3 marks its diagram with a test id. Either proves a render.
  const diagram = page.locator('#canvas svg, [data-testid="diagram"] svg').first();
  await expect(diagram).toBeVisible({ timeout: 60_000 });

  expect(pageErrors).toEqual([]);
});
