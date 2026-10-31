import { expect, test } from '@playwright/test';

import {
  camera,
  copied,
  DEMO_TITLE,
  demoFlow,
  goToStep,
  heading,
  open,
  openFocused,
  stepInput,
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
    const insight = page.getByTestId('insight');
    await insight.getByRole('tab', { name: /^Errors/ }).click();
    await expect(insight).toContainText(
      'Proposed design: none of these steps exist in the code yet.',
    );
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
    await page.getByRole('button', { name: 'How it works' }).click();
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
    // The ⋯ menu reaches it too.
    await page.setViewportSize({ width: 1000, height: 800 });
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
  test('O7 below 1100 px the wheel and theme controls move into the ⋯ menu', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    await open(page);
    const more = page.getByRole('button', { name: 'More' });
    await expect(more).toBeVisible();
    await expect(page.getByRole('button', { name: /^Wheel:/ })).toBeHidden();
    await expect(page.locator('#themeSel')).toBeHidden();
    await expect(page.getByRole('button', { name: /^Export/ })).toBeVisible();
    await more.click();
    const menu = page.getByRole('menu', { name: 'More' });
    await expect(menu.getByRole('menuitem')).toHaveText([
      'How it works',
      'Switch to table view',
      'Insight panel',
      'Ask AI settings',
      'Find',
      'Fit width',
      'Fit all',
      'Wheel: Scroll',
      'Shortcuts and help',
    ]);
    await expect(menu.locator('#themeSel2')).toBeVisible();
    await menu.getByRole('menuitem', { name: 'Wheel: Scroll' }).click();
    await expect(menu).toBeHidden();
    await more.click();
    await expect(menu.getByRole('menuitem', { name: 'Wheel: Zoom' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(more).toBeHidden();
    await expect(page.getByRole('button', { name: 'Wheel: Zoom' })).toBeVisible();
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
