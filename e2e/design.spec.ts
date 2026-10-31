import { expect, test, type Page } from '@playwright/test';

import {
  boxOf,
  closeOverlay,
  diagram,
  expectNoAxeViolations,
  heading,
  open,
  openFocused,
  openPanel,
  stepInput,
  svg,
  topActor,
} from './helpers.ts';

// Plan 8.7 and section 10, row Design: the header, the Flow Rail and the dock, in light and dark,
// at phone width, by keyboard, with reduced motion and with the contrast axe asks for.

const rail = (page: Page) => page.getByTestId('progress');


test.describe('header, Flow Rail and dock', () => {
  test('the header, the dock, the Flow Rail and each tool group carry their tour names', async ({
    page,
  }) => {
    await open(page);
    for (const name of [
      'header',
      'view-switch',
      'find',
      'tools-learn',
      'tools-analyze',
      'tools-export',
      'tools-settings',
      'dock',
      'flow-rail',
      'play',
      'speed',
    ]) {
      await expect(page.locator(`[data-tour="${name}"]`), name).toHaveCount(1);
    }
    await expect(page.locator('#topbar')).toHaveCSS('backdrop-filter', /blur/);
    await expect(page.locator('#flowMeta')).toHaveText(/^42 steps/);
  });

  test('the Flow Rail marks errors, side parts and bookmarks, previews on hover and jumps on click', async ({
    page,
  }) => {
    await openFocused(page);
    await expect(rail(page).locator('[data-marker="error"]')).toHaveCount(3);
    expect(await rail(page).locator('[data-marker="side"]').count()).toBeGreaterThan(0);
    // The demo flow has no @threat lines yet, so the rail shows no threat marker.
    await expect(rail(page).locator('[data-marker="threat"]')).toHaveCount(0);
    await expect(rail(page).locator('[data-marker="star"]')).toHaveCount(0);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('b');
    await expect(rail(page).locator('[data-marker="star"]')).toHaveCount(1);
    // The steps that share a side part with the current one light up below the line.
    expect(await rail(page).locator('[data-shared]').count()).toBeGreaterThan(0);

    const line = await boxOf(rail(page));
    await page.mouse.move(line.x + line.width * 0.5, line.y + line.height / 2);
    const preview = page.getByTestId('rail-preview');
    await expect(preview).toBeVisible();
    await expect(preview).toContainText(/^Step \d+/);
    await expect(preview).toContainText(/Check the request|Reserve stock|Save the order|Reply|Send the email/);
    await page.mouse.click(line.x + line.width * 0.9, line.y + line.height / 2);
    await expect(rail(page)).toHaveAttribute('aria-valuenow', /^(3\d|4\d)$/);
    await expect(stepInput(page)).toHaveValue(/^(3\d|4\d)$/);
    await expect(rail(page)).toHaveAttribute('aria-valuetext', /Send the email/);
    await page.mouse.move(line.x + line.width / 2, line.y - 200);
    await expect(preview).toBeHidden();
  });

  test('the rail is a slider for the keyboard: Page Down and Page Up walk the chapters', async ({
    page,
  }) => {
    await openFocused(page);
    await rail(page).focus();
    await expect(rail(page)).toHaveAttribute('role', 'slider');
    await page.keyboard.press('PageDown');
    await expect(rail(page)).toHaveAttribute('aria-valuenow', '1');
    await expect(rail(page)).toHaveAttribute('aria-valuetext', /Check the request/);
    await page.keyboard.press('PageDown');
    await expect(rail(page)).toHaveAttribute('aria-valuetext', /Reserve stock/);
    await page.keyboard.press('PageUp');
    await expect(rail(page)).toHaveAttribute('aria-valuetext', /Check the request/);
    await page.keyboard.press('ArrowRight');
    await expect(rail(page)).toHaveAttribute('aria-valuenow', '2');
  });

  test('the dock has a large Play, the speed, the chapters and the side parts by kind', async ({
    page,
  }) => {
    await openFocused(page);
    const dock = page.locator('#dock');
    const play = dock.getByRole('button', { name: 'Play' });
    const size = await boxOf(play);
    expect(size.width).toBeGreaterThanOrEqual(44);
    expect(size.height).toBeGreaterThanOrEqual(44);
    await expect(dock.getByLabel('Seconds per step')).toBeVisible();
    await expect(page.getByTestId('chapters').getByRole('button')).toHaveCount(5);
    await expect(page.getByTestId('chapters').getByRole('button', { name: 'Reserve stock' })).toBeVisible();
    await page.getByTestId('chapters').getByRole('button', { name: 'Reserve stock' }).click();
    await expect(rail(page)).toHaveAttribute('aria-valuetext', /Reserve stock/);
    await page.keyboard.press('Home');
    await expect(stepInput(page)).toHaveValue('1');
    await page.getByTestId('behind-btn').click();
    const pop = page.getByRole('dialog', { name: 'Behind the scenes' });
    expect(await pop.locator('details').count()).toBeGreaterThanOrEqual(4);
    await expect(pop.locator('[data-used]')).toHaveCount(1);
    await expect(pop.locator('[data-used]')).toContainText('useCart');
  });

  test('a dot on an arrow shows its side part on hover: name, purpose, file and line, steps', async ({
    page,
  }) => {
    await openFocused(page);
    const dots = page.locator('.swv-uses-dot');
    expect(await dots.count()).toBeGreaterThan(0);
    await dots.first().hover();
    const tip = page.getByTestId('uses-tooltip');
    await expect(tip).toBeVisible();
    await expect(tip).toContainText('hook');
    await expect(tip).toContainText('useCart');
    await expect(tip).toContainText('Adds and removes items');
    await expect(tip).toContainText('src/frontend/hooks/useCart.ts:14');
    await expect(tip).toContainText(/Used on steps? \d/);
  });

  test('a dark diagram gets the dark chapter band, and the dot grid stays open when zoomed out', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await openFocused(page);
    await page.keyboard.press('ArrowRight');
    await expect(svg(page).locator('rect.swv-band').first()).toHaveAttribute('style', /45% 28%/);
    await expect(diagram(page)).toHaveCSS('background-size', /^(1[4-9]|2[0-7])(\.\d+)?px/);
  });

  test('fit leaves the first row and the last layer clear of the canvas tools', async ({ page }) => {
    await openFocused(page);
    const code = await boxOf(page.getByRole('button', { name: 'Code', exact: true }));
    const first = await boxOf(await topActor(page, 'U'));
    expect(first.y).toBeGreaterThanOrEqual(code.y + code.height);
    const tools = await boxOf(page.getByRole('group', { name: 'Diagram view' }));
    let right = 0;
    for (const actor of await svg(page).locator('.swv-actor').all()) {
      const box = await actor.boundingBox();
      if (box) right = Math.max(right, box.x + box.width);
    }
    expect(right).toBeLessThanOrEqual(tools.x);
  });

  test('the dark scheme keeps its contrast with the card, the overlay and the settings open', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await openFocused(page);
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(14, 17, 23)');
    await expectNoAxeViolations(page);
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('card-cur')).toBeVisible();
    await expectNoAxeViolations(page);
    await openPanel(page, 'Analyze', 'Layers');
    await expectNoAxeViolations(page);
    await closeOverlay(page);
    await openPanel(page, 'Settings', 'Theme and display');
    await expectNoAxeViolations(page);
  });

  test('the page theme setting overrides the system scheme and is kept', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await open(page);
    await openPanel(page, 'Settings', 'Theme and display');
    await page.getByRole('radio', { name: 'Dark' }).check();
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(14, 17, 23)');
    await closeOverlay(page);
    await page.reload();
    await expect(svg(page)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(14, 17, 23)');
    await openPanel(page, 'Settings', 'Theme and display');
    await page.getByRole('radio', { name: 'Follow the system' }).check();
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(233, 237, 242)');
  });

  test('reduced motion stops the rail and the dock from animating', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openFocused(page);
    await expect(page.getByTestId('rail-cap')).toHaveCSS('transition-duration', /^(0\.01ms|1e-05s)$/);
    await expect(page.getByRole('button', { name: 'Play' })).toHaveCSS('transition-duration', /^(0\.01ms|1e-05s)/);
  });

  test('at phone width the header keeps the title and ⋯, the dock keeps Play, and nothing overflows', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    await expect(heading(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'More' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
    await expect(rail(page)).toBeVisible();
    const overflow = await page.evaluate(() => {
      const scope = globalThis as unknown as {
        document: { documentElement: { scrollWidth: number } };
        innerWidth: number;
      };
      return scope.document.documentElement.scrollWidth - scope.innerWidth;
    });
    expect(overflow).toBeLessThanOrEqual(0);
    const dock = await boxOf(page.locator('#dock'));
    expect(dock.x).toBeGreaterThanOrEqual(0);
    expect(dock.x + dock.width).toBeLessThanOrEqual(390);
    await expectNoAxeViolations(page);
  });
});
