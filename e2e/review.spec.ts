import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const FLOW = `sequenceDiagram
    %% @spec walkthrough/2
    %% @title Save a thing
    participant C as Controller
    participant D as Database
    %% @layer C kind=controller Picks the status.
    %% @layer D kind=db Stores rows.
    %% @step The controller writes straight to the database.
    %% @threat high The table name comes from the request
    %% @threat low The write has no timeout
    C->>D: INSERT INTO things
    %% @step The row comes back.
    D-->>C: row`;

const CLEAN = `sequenceDiagram
    %% @spec walkthrough/2
    %% @title Greet
    participant A as Alpha
    participant B as Beta
    %% @step Alpha says hello.
    A->>B: hello
    %% @step Beta answers.
    B-->>A: hi`;

const review = (page: Page) => page.getByRole('dialog', { name: /^(Structure review|Threats)$/ });

/** The one place the tests look for the way in, so moving the entry changes only this. */
async function openReview(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Review this flow' }).click();
  await expect(review(page)).toBeVisible();
}

async function openWith(page: Page, code: string): Promise<void> {
  await page.goto('/');
  await page.evaluate((text) => {
    localStorage.clear();
    localStorage.setItem('swv:code', JSON.stringify(text));
  }, code);
  await page.reload();
  await expect(page.getByTestId('overview')).toBeVisible({ timeout: 30_000 });
}

test.describe('structure review', () => {
  test('shows the rating, the confidence, the rules and the honest limits', async ({ page }) => {
    await openWith(page, FLOW);
    await openReview(page);

    const dialog = review(page);
    await expect(dialog.getByTestId('review-scope')).toHaveText('This flow: Save a thing');
    await expect(dialog.getByTestId('review-score')).toHaveText(/^\d+ \/ 100$/);
    await expect(dialog.getByTestId('review-confidence')).toHaveText(/^(Low|Medium|High)$/);
    await expect(dialog.getByTestId('review-findings')).toContainText(
      'Controller reaches Database directly',
    );
    await expect(dialog.getByTestId('review-rules').getByRole('listitem').first()).toBeVisible();

    const limits = dialog.getByTestId('review-limits');
    await expect(limits).toContainText('One flow cannot rate a whole project');
    await expect(limits).toContainText('possible problem, please check');
    await expect(limits).toContainText('not a security audit');
  });

  test('a clean flow gets no findings and no invented threat', async ({ page }) => {
    await openWith(page, CLEAN);
    await openReview(page);

    const dialog = review(page);
    await expect(dialog.getByTestId('review-findings')).toHaveText(
      'The rules found nothing in this flow.',
    );
    await dialog.getByRole('tab', { name: 'Threats (0)' }).click();
    await expect(dialog.getByTestId('review-threats')).toContainText('does not mean it is safe');
  });

  test('a threat shows on its step, and its chip opens the threats', async ({ page }) => {
    await openWith(page, FLOW);
    await expect(page.getByTestId('progress').locator('[data-threat]')).toHaveCount(1);
    await page.keyboard.press('ArrowRight');

    await expect(page.getByTestId('threats')).toContainText(
      'The table name comes from the request',
    );
    await page.getByTestId('threat-chip').first().click();

    const dialog = review(page);
    await expect(dialog.getByRole('tab', { name: 'Threats (2)' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const items = dialog.getByTestId('review-threats').getByRole('listitem');
    await expect(items.first()).toContainText('high threat');
    await expect(items.last()).toContainText('low threat');
  });

  test('a step link closes the review and shows that step', async ({ page }) => {
    await openWith(page, FLOW);
    await openReview(page);

    await review(page)
      .getByRole('button', { name: 'Close the review and go to step 1' })
      .first()
      .click();

    await expect(review(page)).toBeHidden();
    await expect(page.getByLabel('Step number, type to jump')).toHaveValue('1');
  });

  test('Esc closes it and focus goes back to the button that opened it', async ({ page }) => {
    await openWith(page, FLOW);
    await openReview(page);

    await page.keyboard.press('Escape');

    await expect(review(page)).toBeHidden();
    await expect(page.getByRole('button', { name: 'Review this flow' })).toBeFocused();
  });

  test('explaining with no model opens AI settings, and the review stays', async ({ page }) => {
    await openWith(page, FLOW);
    await openReview(page);

    await review(page).getByRole('button', { name: 'Explain in plain words' }).click();

    const settings = page.getByRole('dialog', { name: /AI/ });
    await expect(settings).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(settings).toBeHidden();
    await expect(review(page).getByTestId('review-explain-status')).not.toBeEmpty();
    await expect(review(page).getByTestId('review-score')).toBeVisible();
  });

  test('fits a phone: nothing scrolls sideways', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 700 });
    await openWith(page, FLOW);
    await openReview(page);

    const box = await review(page).boundingBox();
    expect(box).not.toBeNull();
    expect((box?.x ?? -1) + (box?.width ?? 999)).toBeLessThanOrEqual(360);
    const sideways = await review(page).evaluate(
      (dialog: { scrollWidth: number; clientWidth: number }) =>
        dialog.scrollWidth - dialog.clientWidth,
    );
    expect(sideways).toBeLessThanOrEqual(0);
  });

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`has no accessibility violations in the ${colorScheme} theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await openWith(page, FLOW);
      await openReview(page);

      const scan = () =>
        new AxeBuilder({ page })
          .include('[role="dialog"]')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();
      expect((await scan()).violations).toEqual([]);
      await review(page).getByRole('tab', { name: 'Threats (2)' }).click();
      expect((await scan()).violations).toEqual([]);
    });
  }
});
