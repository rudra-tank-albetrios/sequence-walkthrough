import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  boxOf,
  camera,
  closeOverlay,
  DEMO_TITLE,
  goToStep,
  heading,
  open,
  openFocused,
  openPanel,
  overlay,
  stepInput,
  svg,
  viewportOf,
} from './helpers.ts';

// Plan 8.6 and section 10, row Overlay: 85% size, blurred background, sharp overlay, state restored,
// focus kept inside and given back, nearly full screen on a phone.

const scrim = (page: Page) => page.getByTestId('overlay-scrim');



/** Whether the focused element is inside the locator's element. */
const holdsFocus = (locator: Locator): Promise<boolean> =>
  locator.evaluate((el) => {
    const scope = globalThis as unknown as { document: { activeElement: unknown } };
    return (el as unknown as { contains: (node: unknown) => boolean }).contains(scope.document.activeElement);
  });

test.describe('tool overlay', () => {
  test('takes 85% of the page, centred, over a blurred and dimmed page, and stays sharp itself', async ({
    page,
  }) => {
    await open(page);
    await openPanel(page, 'Analyze', 'Layers');
    const size = viewportOf(page);
    const panel = await boxOf(overlay(page));
    expect(Math.abs(panel.width - size.width * 0.85)).toBeLessThanOrEqual(1);
    expect(Math.abs(panel.height - size.height * 0.85)).toBeLessThanOrEqual(1);
    expect(Math.abs(panel.x - size.width * 0.075)).toBeLessThanOrEqual(1);
    expect(Math.abs(panel.y - size.height * 0.075)).toBeLessThanOrEqual(1);
    // The page behind: a strong blur and a 75% dim.
    await expect(scrim(page)).toHaveCSS('backdrop-filter', /blur\(18px\)/);
    await expect(scrim(page)).toHaveCSS('background-color', /rgba\(\d+, \d+, \d+, 0\.75\)/);
    // The overlay itself is not blurred or faded.
    await expect(overlay(page)).toHaveCSS('filter', 'none');
    await expect(overlay(page)).toHaveCSS('backdrop-filter', 'none');
    await expect(overlay(page)).toHaveCSS('opacity', '1');
    // The page is still there behind it.
    await expect(svg(page)).toBeVisible();
    await expect(page.locator('#dock')).toBeVisible();
  });

  test('closes with the button, Esc and a click outside; flow, step and zoom are as before', async ({
    page,
  }) => {
    await openFocused(page);
    await goToStep(page, 7);
    await page.keyboard.press('+');
    await page.keyboard.press('+');
    await expect.poll(async () => (await camera(page)).k).toBeGreaterThan(1);
    await page.waitForTimeout(400);
    const before = await camera(page);

    await openPanel(page, 'Analyze', 'Endpoints');
    await closeOverlay(page);

    await openPanel(page, 'Analyze', 'Endpoints');
    await page.keyboard.press('Escape');
    await expect(overlay(page)).toBeHidden();

    await openPanel(page, 'Analyze', 'Endpoints');
    const size = viewportOf(page);
    await page.mouse.click(size.width * 0.02, size.height / 2);
    await expect(overlay(page)).toBeHidden();

    await expect(heading(page)).toHaveText(DEMO_TITLE);
    await expect(stepInput(page)).toHaveValue('7');
    expect(await camera(page)).toEqual(before);
  });

  test('keeps the focus inside and gives it back to the button that opened it', async ({ page }) => {
    await open(page);
    const opener = page.getByRole('button', { name: 'Analyze', exact: true });
    await opener.click();
    await page.getByRole('menuitem', { name: 'Layers' }).click();
    await expect(overlay(page)).toBeVisible();
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      expect(await holdsFocus(overlay(page))).toBe(true);
    }
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await holdsFocus(overlay(page))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(overlay(page)).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('I opens and closes it, and the panes of a group switch without leaving it', async ({ page }) => {
    await openFocused(page);
    await page.keyboard.press('i');
    await expect(overlay(page)).toBeVisible();
    await overlay(page).getByRole('tab', { name: /^Errors/ }).click();
    await expect(overlay(page).getByRole('heading', { name: 'Errors' })).toBeVisible();
    await expect(overlay(page).getByRole('tab', { name: /^Errors/ })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('i');
    await expect(overlay(page)).toBeHidden();
  });

  test('is nearly the whole screen at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await openFocused(page);
    await page.keyboard.press('i');
    const panel = await boxOf(overlay(page));
    expect(panel.width).toBe(390 - 16);
    expect(panel.height).toBe(800 - 16);
    await expect(overlay(page).getByRole('tab', { name: /^Layers/ })).toBeVisible();
    await closeOverlay(page);
  });
});
