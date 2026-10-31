import { expect, test } from '@playwright/test';

import {
  camera,
  closeOverlay,
  copied,
  DEMO_TITLE,
  demoFlow,
  goToStep,
  heading,
  open,
  openFocused,
  openTool,
  overlay,
  stepInput,
  themeSelect,
} from './helpers.ts';

// Parity rows O3 to O7 and O9 to O11: the header, the two help dialogs, the narrow top bar, the
// colour scheme, the bundled font and reduced motion.

const proposedDemo = () =>
  demoFlow().replace('sequenceDiagram\n', 'sequenceDiagram\n    %% @mode proposed\n');

test.describe('header', () => {
  test('O3 the title, the counts and the page title come from the flow', async ({ page }) => {
    await open(page);
    await expect(heading(page)).toHaveText(DEMO_TITLE);
    await expect(page.locator('#flowMeta')).toHaveText(/^42 steps, \d+ layers, 5 chapters$/);
    await expect(page).toHaveTitle('Place an order · Sequence Walkthrough');
    await expect(page.locator('#topbar').getByText('proposed', { exact: true })).toBeHidden();
  });

  test('O3 an untitled diagram shows the default title', async ({ page }) => {
    await open(page, { code: 'sequenceDiagram\n  A->>B: hi' });
    await expect(heading(page)).toHaveText('Sequence diagram');
    await expect(page).toHaveTitle('Sequence Walkthrough');
    await expect(page.locator('#flowMeta')).toHaveText('1 step, 2 layers');
  });

  test('O3 O4 a proposed flow says so in the header, the overview, the card, Insight and the Markdown', async ({
    page,
  }) => {
    await openFocused(page, { code: proposedDemo(), clipboard: true });
    const chip = page.locator('#topbar').getByText('proposed', { exact: true });
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute(
      'title',
      'This flow is a proposed design: it does not exist in the code yet',
    );
    await expect(page.getByTestId('overview')).toContainText('Proposed design.');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('card-cur').getByText('proposed', { exact: true })).toBeVisible();
    await page.keyboard.press('i');
    await overlay(page).getByRole('tab', { name: /^Errors/ }).click();
    await expect(page.getByTestId('insight')).toContainText(
      'Proposed design: none of these steps exist in the code yet.',
    );
    await closeOverlay(page);
    await page.getByRole('button', { name: /^Export/ }).click();
    await page.getByRole('menuitem', { name: 'Copy table as Markdown' }).click();
    expect(await copied(page)).toContain(
      '**Proposed design:** this flow does not exist in the code yet.',
    );
  });
});

test.describe('help dialogs', () => {
  test('O5 How it works explains the three parts, focuses the download and leads to Shortcuts', async ({
    page,
  }) => {
    await open(page);
    await openTool(page, 'Learn', 'How it works');
    const dialog = page.getByRole('dialog', { name: 'How it works' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { level: 3 })).toHaveText([
      'The viewer',
      'Set up the Claude skill (once)',
      'Use the skill',
    ]);
    await expect(dialog.getByRole('button', { name: 'Download the skill' })).toBeFocused();
    await dialog.getByRole('button', { name: 'Shortcuts' }).click();
    await expect(dialog).toBeHidden();
    const shortcuts = page.getByRole('dialog', { name: 'Shortcuts' });
    await expect(shortcuts).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(shortcuts).toBeHidden();
    // On a phone the ⋯ menu reaches it too.
    await page.setViewportSize({ width: 640, height: 800 });
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('menuitem', { name: 'How it works' }).click();
    await expect(dialog).toBeVisible();
  });

  test('O6 ? opens Shortcuts with the key table, the annotation tags and the Mermaid version', async ({
    page,
  }) => {
    await openFocused(page);
    await page.keyboard.press('?');
    const dialog = page.getByRole('dialog', { name: 'Shortcuts' });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('tbody tr')).toHaveCount(29);
    await expect(dialog.getByRole('row').filter({ hasText: 'Presenter mode' })).toHaveCount(1);
    await expect(
      dialog.getByRole('row').filter({ hasText: 'Lock the arrow keys inside the current chapter' }),
    ).toHaveCount(1);
    await expect(dialog).toContainText('Annotations are Mermaid comments (spec walkthrough/2)');
    await expect(dialog).toContainText('%% @title');
    await expect(dialog).toContainText('Mermaid 12.2.0. mermaid.live may run a different version.');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: 'Keyboard shortcuts and help' }).click();
    await expect(dialog).toBeVisible();
  });
});

test.describe('layout, theme and motion', () => {
  test('O7 below 1100 px the tool groups shrink to icons; on a phone one ⋯ menu holds everything', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    await open(page);
    const topbar = page.locator('#topbar');
    // Find and the four groups stay, as icons named by their labels.
    for (const name of ['Find', 'Learn', 'Analyze', 'Export', 'Settings']) {
      const button = topbar.getByRole('button', { name, exact: true });
      await expect(button).toBeVisible();
      await expect(button.locator('span', { hasText: name })).toBeHidden();
    }
    await expect(page.getByRole('button', { name: 'More' })).toBeHidden();
    // The wheel switch sits with the canvas tools and the theme in Settings, not in the header.
    await expect(page.getByRole('button', { name: /^Wheel:/ })).toBeVisible();
    await expect(page.locator('#themeSel')).toBeHidden();
    await page.setViewportSize({ width: 640, height: 800 });
    const more = page.getByRole('button', { name: 'More' });
    await expect(more).toBeVisible();
    await expect(topbar.getByRole('button', { name: 'Learn', exact: true })).toBeHidden();
    await more.click();
    const menu = page.getByRole('menu', { name: 'More' });
    for (const name of [
      'Switch to table view',
      'Find',
      'Fit width',
      'Fit all',
      'Dim others',
      'Hide controls',
      'How it works',
      'Layers',
      /^PDF/,
      'Theme and display',
      'Stored data',
    ]) {
      await expect(menu.getByRole('menuitem', { name })).toBeVisible();
    }
    await menu.getByRole('menuitem', { name: 'Theme and display' }).click();
    await expect(menu).toBeHidden();
    await expect(themeSelect(page)).toBeVisible();
    await closeOverlay(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(more).toBeHidden();
    await expect(
      topbar.getByRole('button', { name: 'Learn', exact: true }).locator('span', { hasText: 'Learn' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Wheel: Scroll' })).toBeVisible();
  });

  test('O9 the page follows the system colour scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await open(page);
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(14, 17, 23)');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(233, 237, 242)');
  });

  test('O10 the Recursive font is bundled with the page and loaded', async ({ page }) => {
    await open(page);
    await expect
      .poll(() =>
        page.evaluate<boolean>(
          `[...document.fonts].some((f) => f.family.replace(/["']/g, '') === 'Recursive' && f.status === 'loaded')`,
        ),
      )
      .toBe(true);
    await expect(page.getByTestId('card-cur')).toHaveCSS('font-family', /Recursive/);
  });

  test('O11 with reduced motion the cards do not slide and the camera jumps', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openFocused(page);
    await page.keyboard.press('ArrowRight');
    await expect(stepInput(page)).toHaveValue('1');
    await expect(page.getByTestId('cards')).not.toHaveClass(/slide-/);
    await goToStep(page, 30);
    const first = await camera(page);
    await page.waitForTimeout(150);
    expect(await camera(page)).toEqual(first);
  });
});
