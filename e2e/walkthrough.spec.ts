import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const NOTES_KEY = 'swv:notes:t:Place an order';

async function openFresh(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.reload();
  await expect(page.getByTestId('overview')).toBeVisible({ timeout: 30_000 });
}

const stepInput = (page: Page) => page.getByLabel('Step number, type to jump');

test.describe('walkthrough bar', () => {
  test.beforeEach(async ({ page }) => {
    await openFresh(page);
  });

  test('ArrowRight moves to step 1 and the card shows it', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Previous step' })).toBeDisabled();
    await expect(page.getByTestId('card-next')).toContainText('Step 1');
    await page.keyboard.press('ArrowRight');
    await expect(stepInput(page)).toHaveValue('1');
    await expect(page.getByTestId('card-cur')).toContainText(/of \d+/);
    await expect(page.getByTestId('live')).toHaveText(/^Step 1 of \d+\./);
    await expect(page.getByTestId('cards')).toHaveClass(/slide-next/);
  });

  test('chapter buttons exist and jump to their first step', async ({ page }) => {
    const chapters = page.getByTestId('chapters');
    await expect(chapters.getByRole('button', { name: 'Check the request' })).toBeVisible();
    await chapters.getByRole('button', { name: 'Reserve stock' }).click();
    await expect(chapters.getByRole('button', { name: 'Reserve stock' })).toHaveAttribute(
      'aria-current',
      'step',
    );
    await expect(page.getByTestId('step-card')).toContainText('Reserve stock');
    await expect(page.getByTestId('chapter-summary')).toContainText('Reserve stock:');
  });

  test('the path select filters the steps', async ({ page }) => {
    const select = page.getByTestId('path-select');
    await expect(select).toHaveValue('all');
    await select.selectOption('happy');
    await expect(page.getByRole('status').filter({ hasText: /Path:/ })).toContainText(
      /Path: happy path, \d+ of \d+ steps/,
    );
    const hidden = await page.getByTestId('progress').locator('[data-hidden]').count();
    expect(hidden).toBeGreaterThan(0);
    await select.selectOption('all');
    expect(await page.getByTestId('progress').locator('[data-hidden]').count()).toBe(0);
  });

  test('B bookmarks the step, the count rises and survives a reload', async ({ page }) => {
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('bm-btn')).toContainText('★ 0');
    await page.keyboard.press('b');
    await expect(page.getByTestId('bm-btn')).toContainText('★ 1');
    await expect(page.getByTestId('star-btn')).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(page.getByTestId('overview')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('bm-btn')).toContainText('★ 1');
    const stored = await page.evaluate((key) => localStorage.getItem(key), NOTES_KEY);
    expect(stored).toContain('"star":true');
  });

  test('the note editor saves on Esc and the note comes back after a reload', async ({ page }) => {
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('n');
    const ta = page.getByTestId('note-ta');
    await expect(ta).toBeFocused();
    await ta.fill('hello from the test');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('note-view')).toContainText('hello from the test');
    await page.reload();
    await expect(page.getByTestId('overview')).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('note-view')).toContainText('hello from the test');
    const stored = await page.evaluate((key) => localStorage.getItem(key), NOTES_KEY);
    expect(stored).toContain('hello from the test');
  });

  test('Play advances through the steps', async ({ page }) => {
    await page.getByLabel('Seconds per step').selectOption('1000');
    await page.getByRole('button', { name: /^Play/ }).click();
    await expect(page.getByRole('button', { name: /^Pause/ })).toBeVisible();
    await expect(stepInput(page)).toHaveValue('1');
    await expect
      .poll(async () => Number(await stepInput(page).inputValue()), { timeout: 5_000 })
      .toBeGreaterThanOrEqual(2);
    await page.getByRole('button', { name: /^Pause/ }).click();
    await expect(page.getByRole('button', { name: /^Play/ })).toBeVisible();
  });

  test('P shows the presenter card and Esc leaves it', async ({ page }) => {
    await page.keyboard.press('p');
    const card = page.getByTestId('present-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Press → to start');
    await page.keyboard.press('ArrowRight');
    await expect(card).toContainText(/Step 1 of \d+/);
    await page.keyboard.press('Escape');
    await expect(card).toBeHidden();
  });

  test('Esc returns to the overview card', async ({ page }) => {
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(stepInput(page)).toHaveValue('2');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('overview')).toBeVisible();
    await expect(page.getByTestId('cards')).toHaveClass(/slide-prev/);
  });

  test('the step bar has no accessibility violations', async ({ page }) => {
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('step-card')).toBeVisible();
    const results = await new AxeBuilder({ page })
      .include('#wbar')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
