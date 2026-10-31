import { expect, test, type Page } from '@playwright/test';

import {
  DEMO_STEPS,
  camera,
  copied,
  diagram,
  download,
  fixture,
  goToStep,
  heading,
  notice,
  open,
  openFocused,
  stepInput,
  svg,
  toastBox,
} from './helpers.ts';

const table = (page: Page) => page.locator('#tableView');
const row = (page: Page, index: number) => table(page).locator(`tr[data-step="${index}"]`);
const insight = (page: Page) => page.getByTestId('insight');
const code = (page: Page) => page.locator('#code');

const openTab = async (page: Page, name: RegExp) => {
  await diagram(page).focus();
  await page.keyboard.press('i');
  await insight(page).getByRole('tab', { name }).click();
  return insight(page).getByRole('tabpanel');
};

test.describe('table view', () => {
  test('V1 T switches the views and a non-sequence diagram refuses the table', async ({ page }) => {
    await openFocused(page);
    await page.keyboard.press('t');
    await expect(table(page)).toBeVisible();
    await expect(diagram(page)).toBeHidden();
    await expect(page.getByRole('button', { name: 'Table', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.keyboard.press('t');
    await expect(table(page)).toBeHidden();
    await expect(diagram(page)).toBeVisible();
    await page.getByRole('button', { name: 'Table', exact: true }).click();
    await expect(table(page)).toBeVisible();
    await page.getByRole('button', { name: 'Diagram', exact: true }).click();
    await expect(table(page)).toBeHidden();
    await openFocused(page, { code: fixture('not-sequence') });
    await page.keyboard.press('t');
    await expect(toastBox(page)).toContainText('The table works with sequence diagrams');
    await expect(table(page)).toBeHidden();
  });

  test('V1 going back to the diagram shows the step picked in the table', async ({ page }) => {
    await openFocused(page);
    await page.getByTitle('Set zoom to 100%').click();
    await diagram(page).focus();
    await page.keyboard.press('t');
    await row(page, 30).click();
    await page.keyboard.press('t');
    await expect(svg(page).locator('[data-step="30"].swv-cur').first()).toBeAttached();
    await expect
      .poll(async () => {
        const line = await svg(page)
          .locator('.messageLine0.swv-cur, .messageLine1.swv-cur')
          .first()
          .boundingBox();
        const canvas = await diagram(page).boundingBox();
        return Boolean(line && canvas && line.y >= canvas.y && line.y <= canvas.y + canvas.height);
      })
      .toBe(true);
  });

  test('V2 columns, rows and clicks', async ({ page }) => {
    await openFocused(page);
    await page.keyboard.press('t');
    await expect(table(page).locator('thead th')).toHaveText([
      '#',
      'Chapter',
      'From → To',
      'Sends',
      'Does',
      'Branch',
      'Behind',
      'Ref',
      '★ Note',
    ]);
    await expect(table(page).locator('tbody tr')).toHaveCount(DEMO_STEPS);
    await expect(row(page, 0)).toContainText('Check the request');
    await expect(row(page, 1).locator('td').nth(1)).toBeEmpty();
    await expect(row(page, 21)).toContainText('409');
    await expect(row(page, 21).locator('[title^="Conflict"]')).toBeVisible();
    await expect(row(page, 9).locator('b', { hasText: 'else' })).toBeVisible();
    await expect(row(page, 0)).toContainText('hook useCart');
    await expect(row(page, 3)).toContainText('src/frontend/api/client.ts:50');
    await row(page, 2).click();
    await expect(row(page, 2)).toHaveAttribute('aria-current', 'step');
    await row(page, 5).dblclick();
    await expect(table(page)).toBeHidden();
    await expect(stepInput(page)).toHaveValue('6');
  });

  test('V2 no chapters means no chapter column; a step without text says so', async ({ page }) => {
    await openFocused(page, { code: 'sequenceDiagram\n  A->>B: one\n  B-->>A: 404 Not Found' });
    await page.keyboard.press('t');
    await expect(table(page).locator('thead th')).toHaveCount(8);
    await expect(row(page, 0)).toContainText('No explanation');
  });

  test('V2 spotlight, path, Follow and Find reach the rows', async ({ page }) => {
    await openFocused(page);
    await svg(page).locator('.swv-actor[data-alias="RD"]').first().click({ force: true });
    await page.keyboard.press('t');
    const spotCount = await table(page).locator('tbody tr').count();
    expect(spotCount).toBeLessThan(DEMO_STEPS);
    expect(spotCount).toBeGreaterThan(0);
    // The notice with Show all is on the canvas, behind the table as in version 2: Esc clears it.
    await page.keyboard.press('Escape');
    await expect(table(page).locator('tbody tr')).toHaveCount(DEMO_STEPS);
    await page.getByTestId('path-select').selectOption('happy');
    const happy = await table(page).locator('tbody tr').count();
    expect(happy).toBeLessThan(DEMO_STEPS);
    await page.getByTestId('path-select').selectOption('all');
    await page.keyboard.press('/');
    await page.getByPlaceholder('Find in labels and explanations').fill('409 Conflict');
    await expect(table(page).locator('tbody tr[class*="findhit"]').first()).toBeAttached();
    await page.keyboard.press('Escape');
    await expect(table(page).locator('tbody tr[class*="findhit"]')).toHaveCount(0);
  });

  test('V3 the footer saves, copies and carries the notes option', async ({ page }) => {
    await open(page, { clipboard: true });
    await diagram(page).focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('n');
    await page.getByTestId('note-ta').fill('my remark');
    await page.keyboard.press('Escape');
    await page.keyboard.press('t');
    const csv = await download(page, () =>
      page.getByRole('button', { name: 'Download CSV' }).click(),
    );
    expect(csv.name).toBe('Place an order.csv');
    expect(csv.text).not.toContain('my remark');
    const include = page.getByLabel('Include my notes');
    await include.check();
    const withNotes = await download(page, () =>
      page.getByRole('button', { name: 'Download CSV' }).click(),
    );
    expect(withNotes.text).toContain('Bookmarked,Note');
    expect(withNotes.text).toContain('my remark');
    await page.getByRole('button', { name: 'Copy as Markdown' }).click();
    await expect(toastBox(page)).toContainText('Copied the step table as Markdown');
    expect(await copied(page)).toContain('my remark');
    await expect(page.getByRole('button', { name: 'Back to diagram' })).toBeHidden();
  });
});

test.describe('code panel', () => {
  test('V4 C, the Code button and × open and close the panel; the text gets the focus', async ({
    page,
  }) => {
    await openFocused(page);
    const panel = page.locator('#codePanel');
    await expect(panel).toBeHidden();
    await page.keyboard.press('c');
    await expect(panel).toBeVisible();
    await expect(code(page)).toBeFocused();
    const button = page.getByRole('button', { name: /^(<\/> )?Code/ }).first();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    // The open panel covers the canvas button, as it did in version 2, so the panel's × closes it.
    await page.getByRole('button', { name: 'Close the code panel' }).click();
    await expect(panel).toBeHidden();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await button.click();
    await expect(panel).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
  });

  test('V4 the fit keeps clear of the open panel', async ({ page }) => {
    await openFocused(page, { code: fixture('payment-idempotency') });
    await page.keyboard.press('c');
    await diagram(page).focus();
    await page.keyboard.press('0');
    const panel = await page.locator('#codePanel').boundingBox();
    await expect
      .poll(async () => {
        const box = await svg(page).boundingBox();
        return box !== null && panel !== null && box.x >= panel.x + panel.width - 1;
      })
      .toBe(true);
  });

  test('V5 the gutter and highlight follow the step and the caret picks a step', async ({
    page,
  }) => {
    await openFocused(page);
    await page.keyboard.press('c');
    await expect(page.locator('#codePanel [data-cur]')).toHaveCount(0);
    await diagram(page).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#codePanel [data-cur]').first()).toBeAttached();
    const text = await code(page).inputValue();
    const at = text.indexOf('API->>APP');
    await code(page).evaluate((el, position) => {
      const area = el as unknown as {
        setSelectionRange: (a: number, b: number) => void;
        focus: () => void;
      };
      area.focus();
      area.setSelectionRange(position, position);
    }, at);
    await code(page).press('ArrowRight');
    await expect(stepInput(page)).toHaveValue('4');
    await expect(page.locator('#codePanel pre .t-al').first()).toBeAttached();
  });

  test('V5 the highlight colours tags, comments, keywords, arrows and aliases', async ({
    page,
  }) => {
    await openFocused(page, {
      code: 'sequenceDiagram\n  %% @title T\n  %% plain\n  participant A as Alpha\n  A->>B: hi',
    });
    await page.keyboard.press('c');
    const layer = page.locator('#codePanel pre');
    await expect(layer.locator('.t-tag')).toContainText(['@title']);
    await expect(layer.locator('.t-cm').first()).toBeAttached();
    await expect(layer.locator('.t-kw').first()).toBeAttached();
    await expect(layer.locator('.t-ar').first()).toHaveText('->>');
    await expect(layer.locator('.t-al').first()).toHaveText('A');
  });

  test('V6 V7 the status and the notes list the annotation problems', async ({ page }) => {
    await openFocused(page, { code: fixture('lint-cases') });
    await page.keyboard.press('c');
    const notes = page.getByRole('list', { name: 'Notes on the annotations' });
    await expect(notes).toContainText('notes on the annotations');
    await expect(notes).toContainText('has no @step');
    const unexplained = await notes.getByRole('button', { name: /has no @step/ }).count();
    await expect(page.getByTestId('code-count')).toHaveText(`${unexplained} unexplained`);
    await notes.getByRole('button').first().click();
    await expect(code(page)).toBeFocused();
  });

  test('V6 every lint message from version 2 shows', async ({ page }) => {
    await openFocused(page, {
      code: [
        'sequenceDiagram',
        '  %% @section Empty one',
        '  %% @section Real one',
        '  %% @nonsense value',
        `  %% @step ${'x'.repeat(250)}`,
        '  A->>B: one',
        '  B-->>A: two',
        '  %% @layer Z no such part',
        '  %% @step left with no arrow after it',
      ].join('\n'),
    });
    await page.keyboard.press('c');
    const notes = page.getByRole('list', { name: 'Notes on the annotations' });
    await expect(notes).toContainText('Add %% @title');
    await expect(notes).toContainText('Chapter "Empty one" has no steps');
    await expect(notes).toContainText('Unknown tag @nonsense');
    await expect(notes).toContainText('Annotation has no arrow after it');
    await expect(notes).toContainText('(keep it under 240)');
    await expect(notes).toContainText('@layer Z: no participant has this alias');
  });

  test('V7 the badge is hidden when nothing is missing', async ({ page }) => {
    await openFocused(page);
    await expect(page.getByTestId('code-count')).toBeHidden();
  });

  test('V8 the fix-prompt names the missing steps; other diagrams are refused', async ({
    page,
  }) => {
    await open(page, { clipboard: true, code: fixture('no-annotations') });
    await diagram(page).focus();
    await page.keyboard.press('c');
    await page.getByRole('button', { name: 'Copy fix-prompt' }).click();
    await expect(toastBox(page)).toHaveText(/^Copied a fix-prompt for \d+ unexplained steps?$/);
    expect(await copied(page)).toMatch(/^Use the sequence-walkthrough skill in update mode/);
    await code(page).fill(fixture('not-sequence'));
    await expect(heading(page)).toBeVisible();
    await expect(notice(page)).toContainText('flowchart');
    await page.getByRole('button', { name: 'Copy fix-prompt' }).click();
    await expect(toastBox(page)).toHaveText('The fix-prompt works with sequence diagrams');
  });

  test('V9 copy code and Load example, which also refits the camera', async ({ page }) => {
    await open(page, { clipboard: true, code: 'sequenceDiagram\n  %% @title Mine\n  A->>B: one' });
    await diagram(page).focus();
    await page.keyboard.press('c');
    await page.getByRole('button', { name: 'Copy code' }).click();
    await expect(toastBox(page)).toHaveText('Copied the code');
    expect(await copied(page)).toContain('@title Mine');
    await diagram(page).focus();
    await page.keyboard.press('+');
    await page.keyboard.press('+');
    const zoomed = await camera(page);
    await page.getByRole('button', { name: 'Load example' }).click();
    await expect(toastBox(page)).toHaveText('Loaded the example flow');
    await expect(heading(page)).toHaveText('Place an order');
    await expect(
      svg(page).locator('.messageLine0[data-step="41"], .messageLine1[data-step="41"]'),
    ).toBeAttached();
    await expect.poll(async () => (await camera(page)).k).not.toBe(zoomed.k);
  });

  test('P10 the code is saved a moment after a change and comes back', async ({ page }) => {
    await openFocused(page);
    await page.keyboard.press('c');
    const changed = 'sequenceDiagram\n  %% @title Saved one\n  A->>B: hi\n  B-->>A: ok';
    await code(page).fill(changed);
    await expect(heading(page)).toHaveText('Saved one');
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('swv:code')))
      .toBe(JSON.stringify(changed));
    await page.reload();
    await expect(heading(page)).toHaveText('Saved one', { timeout: 30_000 });
  });
});

test.describe('insight', () => {
  test('V10 I opens the panel with six tabs; × closes; the step links work', async ({ page }) => {
    await openFocused(page);
    await page.keyboard.press('i');
    await expect(insight(page)).toBeVisible();
    await expect(insight(page).getByRole('heading', { name: 'Insight' })).toBeVisible();
    const tabs = insight(page).getByRole('tab');
    await expect(tabs).toHaveCount(6);
    for (const [i, name] of [
      'Layers',
      'Endpoints',
      'Errors',
      'Behind the scenes',
      'Glossary',
      'Data',
    ].entries()) {
      await expect(tabs.nth(i)).toContainText(name);
    }
    await insight(page).locator('[data-go="3"]').first().click();
    await expect(stepInput(page)).toHaveValue('4');
    await expect(insight(page).locator('[data-go="3"]').first()).toHaveAttribute(
      'aria-current',
      'step',
    );
    await page.getByRole('button', { name: 'Close the Insight panel' }).click();
    await expect(insight(page)).toBeHidden();
    await expect(diagram(page)).toBeFocused();
    await page.getByRole('button', { name: 'Insight', exact: true }).click();
    await expect(insight(page)).toBeVisible();
  });

  test('V10 a non-sequence diagram gets one line', async ({ page }) => {
    await openFocused(page, { code: fixture('not-sequence') });
    await page.keyboard.press('i');
    await expect(insight(page)).toContainText('The Insight panel works with sequence diagrams.');
  });

  test('V11 Layers lists the participants and their facts', async ({ page }) => {
    const panel = await (async () => {
      await openFocused(page);
      return openTab(page, /Layers/);
    })();
    await expect(panel.locator('[data-layer]')).toHaveCount(20);
    const redis = panel.locator('[data-layer="RD"]');
    await expect(redis).toContainText('Redis');
    await expect(redis).toContainText('cache');
    await expect(redis).toContainText('stock counters');
    await expect(redis).toContainText(/\d+ steps · /);
    await expect(panel.locator('[data-layer="SVC"]')).toContainText('Files:');
    await expect(panel).toContainText('Trust boundaries:');
    await redis.getByRole('button', { name: 'Only this layer' }).click();
    await expect(notice(page)).toContainText('Showing only');
    await redis.getByRole('button', { name: 'Show all' }).click();
    await expect(notice(page)).toBeHidden();
  });

  test('V11 layers without kinds ask for them', async ({ page }) => {
    await openFocused(page, { code: 'sequenceDiagram\n  A->>B: one' });
    const panel = await openTab(page, /Layers/);
    await expect(panel).toContainText('No @layer description.');
    await expect(panel).toContainText(
      'Add kind= to the @layer lines to get icons and trust-boundary lines.',
    );
  });

  test('V12 Endpoints lists the calls with their replies', async ({ page }) => {
    await openFocused(page);
    const panel = await openTab(page, /Endpoints/);
    await expect(panel.locator('thead th')).toHaveText(['Call', 'From → To', 'Replies']);
    const callRow = panel.locator('tbody tr').first();
    await expect(callRow).toContainText('POST');
    await expect(callRow).toContainText('/api/orders');
    await expect(callRow).toContainText('201');
    await openFocused(page, { code: 'sequenceDiagram\n  A->>B: one' });
    const empty = await openTab(page, /Endpoints/);
    await expect(empty).toContainText('No arrow label starts with an HTTP method and a path yet.');
  });

  test('V13 Errors lists every failure and the unconfirmed details', async ({ page }) => {
    await openFocused(page);
    const panel = await openTab(page, /Errors/);
    await expect(panel.locator('thead th')).toHaveText(['Status', 'Message', 'When', 'Cause']);
    await expect(panel.locator('[data-error-step]')).toHaveCount(3);
    await panel.locator('[data-error-step="21"]').getByRole('button', { name: '409' }).click();
    await expect(stepInput(page)).toHaveValue('22');
    await openFocused(page, {
      code: 'sequenceDiagram\n  %% @mode proposed\n  %% @unconfirmed Which queue\n  A->>B: one',
    });
    const other = await openTab(page, /Errors/);
    await expect(other).toContainText('No reply with a 4xx or 5xx status in this flow.');
    await expect(other).toContainText('Not confirmed from the code');
    await expect(other).toContainText('Which queue');
    await expect(other).toContainText(
      'Proposed design: none of these steps exist in the code yet.',
    );
  });

  test('V14 Behind groups the side parts and the effects', async ({ page }) => {
    await openFocused(page);
    const panel = await openTab(page, /Behind the scenes/);
    await expect(panel.locator('details').first()).toHaveAttribute('open', '');
    await expect(panel.locator('summary', { hasText: 'hook' })).toContainText('1 item');
    await expect(panel.locator('summary', { hasText: 'effects' })).toBeVisible();
    await expect(panel).toContainText('useCart');
    await expect(panel).toContainText('src/frontend/hooks/useCart.ts:14');
    await openFocused(page, { code: 'sequenceDiagram\n  A->>B: one' });
    const empty = await openTab(page, /Behind the scenes/);
    await expect(empty).toContainText('@uses');
    await expect(empty).toContainText('@effect');
  });

  test('V15 Glossary lists the terms and saved answers, and adds, edits and deletes', async ({
    page,
  }) => {
    await openFocused(page);
    const panel = await openTab(page, /Glossary/);
    await expect(panel.locator('dt')).toContainText(['bearer token', 'DTO', 'hold', 'minor units']);
    await expect(panel).toContainText(
      'Saved terms stay in this browser. Underlined words on the cards open their definition.',
    );
    await panel.getByLabel('Term').fill('shopper');
    await panel.getByPlaceholder('Definition in one sentence').fill('The person buying.');
    await panel.getByRole('button', { name: 'Add' }).click();
    const added = panel.locator('[data-term="shopper"]');
    await expect(added).toContainText('saved answer');
    await goToStep(page, 1);
    await expect(
      page.getByTestId('explain').getByRole('button', { name: 'shopper' }),
    ).toBeVisible();
    await added.getByRole('button', { name: 'Edit' }).click();
    await added.getByLabel('Definition of shopper').fill('The one who buys.');
    await added.getByRole('button', { name: 'Save' }).click();
    await expect(added).toContainText('The one who buys.');
    await added.getByRole('button', { name: 'Delete' }).click();
    await expect(added).toBeHidden();
  });

  test('V16 Data lists the tables and files', async ({ page }) => {
    await openFocused(page, { code: fixture('sql-data') });
    const panel = await openTab(page, /Data/);
    await expect(panel.getByRole('heading', { name: 'Tables touched' })).toBeVisible();
    await expect(panel.locator('thead th')).toHaveText(['Table', 'Operations', 'Steps']);
    await expect(panel.locator('tbody td.mono').first()).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'Files in this flow' })).toBeVisible();
    await openFocused(page, { code: 'sequenceDiagram\n  A->>B: one' });
    const empty = await openTab(page, /Data/);
    await expect(empty).toContainText('@payload.sql');
    await expect(empty).toContainText('No @ref lines yet.');
  });
});
