import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('web app shell', () => {
  test('opens the demo flow with no console or page errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Place an order');
    await expect(page.getByTestId('diagram').locator('svg').first()).toBeVisible({
      timeout: 30_000,
    });

    expect(errors).toEqual([]);
  });

  test('has no accessibility violations', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('diagram').locator('svg').first()).toBeVisible({
      timeout: 30_000,
    });

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
