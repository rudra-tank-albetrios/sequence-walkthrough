import { expect, test } from '@playwright/test';

import { diagram, expectNoAxeViolations, openFocused } from './helpers.ts';

// Plan section 9: axe on the main screens with each dialog, panel and popover open. The overview
// alone is checked in app.spec.ts and the bare step bar in walkthrough.spec.ts.

test.describe('accessibility with things open', () => {
  test('the step bar with the Behind and bookmark popovers, the note editor and Find', async ({
    page,
  }) => {
    await openFocused(page);
    await page.keyboard.press('ArrowRight');
    await page.getByTestId('behind-btn').click();
    await expect(page.getByRole('dialog', { name: 'Behind the scenes' })).toBeVisible();
    await expectNoAxeViolations(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Behind the scenes' })).toBeHidden();
    await page.getByTestId('bm-btn').click();
    await expect(page.getByRole('dialog', { name: 'Bookmarks and notes' })).toBeVisible();
    await expectNoAxeViolations(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Bookmarks and notes' })).toBeHidden();
    await diagram(page).focus();
    await page.keyboard.press('n');
    await expect(page.getByTestId('note-ta')).toBeVisible();
    await expectNoAxeViolations(page);
    await page.keyboard.press('Escape');
    await diagram(page).focus();
    await page.keyboard.press('/');
    await expect(page.getByTestId('find')).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('the panels: every Insight tab, the code panel, the table and presenter mode', async ({
    page,
  }) => {
    await openFocused(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('i');
    const insight = page.getByTestId('insight');
    await expect(insight).toBeVisible();
    for (const tab of await insight.getByRole('tab').all()) {
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      await expectNoAxeViolations(page);
    }
    await diagram(page).focus();
    await page.keyboard.press('Escape');
    await expect(insight).toBeHidden();
    await page.keyboard.press('c');
    await expect(page.locator('#codePanel')).toBeVisible();
    await expectNoAxeViolations(page);
    await diagram(page).focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('#codePanel')).toBeHidden();
    await page.keyboard.press('t');
    await expect(page.locator('#tableView table')).toBeVisible();
    await expectNoAxeViolations(page);
    await page.keyboard.press('t');
    await diagram(page).focus();
    await page.keyboard.press('p');
    await expect(page.getByTestId('present-card')).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('each dialog and the export menu', async ({ page }) => {
    await openFocused(page);
    await page.getByRole('button', { name: 'How it works' }).click();
    const guide = page.getByRole('dialog', { name: 'How it works' });
    await expect(guide).toBeVisible();
    await expectNoAxeViolations(page);
    await page.keyboard.press('Escape');
    await expect(guide).toBeHidden();
    await page.getByRole('button', { name: 'Keyboard shortcuts and help' }).click();
    const shortcuts = page.getByRole('dialog', { name: 'Shortcuts' });
    await expect(shortcuts).toBeVisible();
    await expectNoAxeViolations(page);
    await page.keyboard.press('Escape');
    await expect(shortcuts).toBeHidden();
    await page.getByRole('button', { name: /^Export/ }).click();
    await expect(page.getByRole('menu', { name: 'Export and share' })).toBeVisible();
    await expectNoAxeViolations(page);
    await page.getByRole('menuitem', { name: /^PDF/ }).click();
    const pdf = page.getByRole('dialog', { name: 'Download PDF' });
    await expect(pdf).toBeVisible();
    await expectNoAxeViolations(page);
    await page.keyboard.press('Escape');
    await expect(pdf).toBeHidden();
    await page.getByRole('button', { name: /^Export/ }).click();
    await page.getByRole('menuitem', { name: /^Paste a link or code/ }).click();
    const importDialog = page.getByRole('dialog', { name: 'Import' });
    await expect(importDialog).toBeVisible();
    await expectNoAxeViolations(page);
    await page.keyboard.press('Escape');
    await expect(importDialog).toBeHidden();
    await diagram(page).focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('a');
    const ask = page.getByRole('dialog', { name: 'Ask AI about step 1' });
    await expect(ask).toBeVisible();
    await expectNoAxeViolations(page);
    await ask.getByTitle('Provider, key, model').click();
    await expect(page.getByRole('dialog', { name: 'Ask AI', exact: true })).toBeVisible();
    await expectNoAxeViolations(page);
  });
});
