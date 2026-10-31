import { expect, test } from '@playwright/test';

import {
  closeOverlay,
  heading,
  open,
  openFocused,
  overlay,
  stepInput,
  viewportOf,
} from './helpers.ts';

// Parity rows O7 and O8 on the phone project (Pixel 7): the top bar keeps the title and the ⋯ menu,
// the step bar drops its side cards, and the table, the code panel and Insight fill the screen.


test.describe('phone layout', () => {
  test('O8 the top bar keeps the title and the ⋯ menu, which holds the export items', async ({
    page,
  }) => {
    await open(page);
    await expect(heading(page)).toBeVisible();
    await expect(page.locator('#flowMeta')).toBeHidden();
    for (const name of ['Find', 'Fit', 'How it works', 'Keyboard shortcuts and help', /^Export/]) {
      await expect(page.getByRole('button', { name })).toBeHidden();
    }
    await expect(page.getByRole('group', { name: 'View' })).toBeHidden();
    await expect(page.getByRole('group', { name: 'Zoom' })).toBeHidden();
    await page.getByRole('button', { name: 'More' }).click();
    const menu = page.getByRole('menu', { name: 'More' });
    await expect(menu.getByRole('menuitem', { name: 'How it works' })).toBeVisible();
    await expect(menu.getByText('Export and share')).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /^PDF/ })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Copy table as Markdown' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Shortcuts and help' })).toBeVisible();
    await menu.getByRole('menuitem', { name: 'How it works' }).click();
    await expect(page.getByRole('dialog', { name: 'How it works' })).toBeVisible();
  });

  test('O8 the step bar drops the side cards and the table is a full-screen sheet with a way back', async ({
    page,
  }) => {
    await openFocused(page);
    await page.keyboard.press('ArrowRight');
    await expect(stepInput(page)).toHaveValue('1');
    await expect(page.getByTestId('card-cur')).toBeVisible();
    await expect(page.getByTestId('card-prev')).toBeHidden();
    await expect(page.getByTestId('card-next')).toBeHidden();
    await page.keyboard.press('t');
    const table = page.locator('#tableView');
    await expect(table).toBeVisible();
    const box = await table.boundingBox();
    expect(box?.width).toBe(viewportOf(page).width);
    expect(box?.height).toBe(viewportOf(page).height);
    // Rows are stacked cards: the header row is gone and each cell carries its label.
    await expect(table.locator('thead')).toBeHidden();
    await expect(table.locator('td[data-l="Step"]').first()).toBeVisible();
    await expect(table.getByRole('button', { name: 'Back to diagram' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(table).toBeHidden();
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('menuitem', { name: 'Switch to table view' }).click();
    await expect(table).toBeVisible();
    await table.getByRole('button', { name: 'Back to diagram' }).click();
    await expect(table).toBeHidden();
  });

  test('O8 the code panel and Insight fill the screen, and the code does not take the keyboard', async ({
    page,
  }) => {
    await openFocused(page);
    await page.keyboard.press('c');
    const panel = page.locator('#codePanel');
    await expect(panel).toBeVisible();
    expect((await panel.boundingBox())?.width).toBe(viewportOf(page).width);
    await expect(page.getByRole('textbox', { name: 'Diagram code' })).not.toBeFocused();
    await page.getByRole('button', { name: 'Close the code panel' }).click();
    await expect(panel).toBeHidden();
    await page.keyboard.press('i');
    const insight = page.getByTestId('insight');
    await expect(insight).toBeVisible();
    // The overlay is nearly the whole screen on a phone: an 8 px margin on each side (plan 8.6).
    const box = await overlay(page).boundingBox();
    expect(box?.width).toBe(viewportOf(page).width - 16);
    expect(box?.height).toBe(viewportOf(page).height - 16);
    await closeOverlay(page);
    await expect(insight).toBeHidden();
  });
});
