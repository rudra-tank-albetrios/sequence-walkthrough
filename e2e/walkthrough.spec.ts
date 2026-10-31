import { expect, test, type Page } from '@playwright/test';

import {
  closeOverlay,
  DEMO_NOTES_KEY,
  DEMO_STEPS,
  diagram,
  expectNoAxeViolations,
  fixture,
  goToStep,
  notice,
  open,
  openFocused,
  stepInput,
  svg,
  toastBox,
} from './helpers.ts';

const SHORT = 'sequenceDiagram\n  %% @title Short\n  A->>B: one\n  B-->>A: two\n  A->>B: three';

const settings = (page: Page) =>
  page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('swv:settings') ?? '{}') as {
        cardH?: number;
        speed?: number;
        fold?: { top?: boolean; bar?: boolean };
      },
  );

const fullscreen = (page: Page) =>
  page.evaluate(
    () =>
      (globalThis as unknown as { document: { fullscreenElement: unknown } }).document
        .fullscreenElement !== null,
  );

test.describe('walkthrough', () => {
  test('W1 the bar shows the cards around the current step, with ends disabled', async ({
    page,
  }) => {
    await openFocused(page);
    await expect(page.getByRole('button', { name: 'Previous step' })).toBeDisabled();
    await expect(page.getByTestId('overview')).toBeVisible();
    const next = page.getByTestId('card-next');
    await expect(next).toContainText('Step 1');
    await expect(next).toContainText('U → PG');
    await expect(next).toContainText('Click "Place order"');
    await next.click();
    await expect(page.getByTestId('card-cur')).toContainText(`of ${DEMO_STEPS}`);
    await expect(page.getByTestId('card-next')).toContainText('Step 2');
    await goToStep(page, 3);
    await expect(page.getByTestId('card-prev')).toContainText('Step 2');
    await page.keyboard.press('End');
    await expect(page.getByRole('button', { name: 'Next step' })).toBeDisabled();
    await expect(page.getByTestId('card-next')).toBeEmpty();
  });

  test('W2 changing step slides the cards the right way', async ({ page }) => {
    await openFocused(page);
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('cards')).toHaveClass(/slide-next/);
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('cards')).toHaveClass(/slide-prev/);
  });

  test('W3 arrows, Home and End move; typing, modifiers and modals do not', async ({ page }) => {
    await openFocused(page);
    await page.keyboard.press('ArrowRight');
    await expect(stepInput(page)).toHaveValue('1');
    await page.keyboard.press('End');
    await expect(stepInput(page)).toHaveValue(String(DEMO_STEPS));
    await page.keyboard.press('Home');
    await expect(stepInput(page)).toHaveValue('1');
    await page.keyboard.press('Control+ArrowRight');
    await page.keyboard.press('Alt+ArrowRight');
    await expect(stepInput(page)).toHaveValue('1');
    await page.keyboard.press('?');
    await expect(page.getByRole('dialog', { name: 'Shortcuts' })).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('b');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Shortcuts' })).toBeHidden();
    await expect(stepInput(page)).toHaveValue('1');
    await expect(page.getByTestId('bm-btn')).toContainText('★ 0');
    await page.keyboard.press('c');
    await page.locator('#code').press('ArrowRight');
    await expect(stepInput(page)).toHaveValue('1');
  });

  test('W4 brackets and tabs move between chapters', async ({ page }) => {
    await openFocused(page);
    const chapters = page.getByTestId('chapters');
    await expect(chapters.getByRole('button', { name: /^Check the request/ })).toBeVisible();
    await page.keyboard.press(']');
    await page.keyboard.press(']');
    await expect(chapters.getByRole('button', { name: 'Reserve stock' })).toHaveAttribute(
      'aria-current',
      'step',
    );
    await expect(page.getByTestId('step-card')).toContainText('Reserve stock');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('[');
    await expect(page.getByTestId('chapter-summary')).toContainText('Reserve stock:');
    await page.keyboard.press('[');
    await expect(chapters.getByRole('button', { name: 'Check the request' })).toHaveAttribute(
      'aria-current',
      'step',
    );
    await chapters.getByRole('button', { name: 'Save the order' }).click();
    await expect(page.getByTestId('step-card')).toContainText('Save the order');
    await expect(chapters.getByRole('button', { name: 'Reserve stock' })).toHaveAttribute(
      'title',
      /./,
    );
  });

  test('W4 a first chapter that starts late gets an implicit Start', async ({ page }) => {
    await openFocused(page, { code: fixture('sections-start') });
    await expect(page.getByTestId('chapters').getByRole('button').first()).toHaveText('Start');
  });

  test('W5 K keeps the arrows inside the chapter and says so', async ({ page }) => {
    await openFocused(page);
    // Step 15 opens the second chapter; from step 1, Left goes to the overview as in version 2.
    await goToStep(page, 15);
    await page.keyboard.press('k');
    const lock = page.getByRole('button', { name: 'Stay inside the current chapter' });
    await expect(lock).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('live')).toHaveText(
      'Chapter locked: the arrow keys stay inside this chapter',
    );
    await page.keyboard.press('ArrowLeft');
    await expect(toastBox(page)).toContainText(
      'Start of this chapter. Press K to unlock the chapter.',
    );
    await expect(stepInput(page)).toHaveValue('15');
    for (let i = 0; i < DEMO_STEPS; i++) await page.keyboard.press('ArrowRight');
    await expect(toastBox(page)).toContainText(
      'End of this chapter. Press K to unlock the chapter.',
    );
    const last = await stepInput(page).inputValue();
    expect(Number(last)).toBeLessThan(DEMO_STEPS);
    await lock.click();
    await expect(page.getByTestId('live')).toHaveText('Chapter unlocked');
    await page.keyboard.press('ArrowRight');
    await expect(stepInput(page)).toHaveValue(String(Number(last) + 1));
  });

  test('W6 the Flow Rail fills and its chapters jump', async ({ page }) => {
    await openFocused(page);
    const progress = page.getByTestId('progress');
    await expect(progress).toHaveAttribute('aria-valuenow', '0');
    await expect(progress).toHaveAttribute('aria-valuemax', String(DEMO_STEPS));
    await expect(progress).toHaveAttribute('aria-valuetext', `Overview, ${DEMO_STEPS} steps`);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(progress).toHaveAttribute('aria-valuenow', '2');
    await expect(progress).toHaveAttribute(
      'aria-valuetext',
      new RegExp(`^Step 2 of ${DEMO_STEPS}, `),
    );
    await expect(page.getByTestId('progress-seg')).toHaveCount(5);
    // The start of the last chapter: a click lands on the step under the pointer.
    await page
      .getByTestId('progress-seg')
      .last()
      .click({ position: { x: 1, y: 4 } });
    await expect(page.getByTestId('step-card')).toContainText('Send the email');
  });

  test('W6 without chapters there is one segment named after the flow', async ({ page }) => {
    await openFocused(page, { code: SHORT });
    const segments = page.getByTestId('progress-seg');
    await expect(segments).toHaveCount(1);
    await expect(segments).toHaveAttribute('title', /^Short: /);
  });

  test('W7 Space plays at the chosen speed, Esc stops, the speed is remembered', async ({
    page,
  }) => {
    await openFocused(page);
    await page.getByLabel('Seconds per step').selectOption('1000');
    await diagram(page).focus();
    await page.keyboard.press('Space');
    const pause = page.getByRole('button', { name: /^Pause/ });
    await expect(pause).toBeVisible();
    await expect(pause).toHaveAttribute('aria-pressed', 'true');
    await expect(stepInput(page)).toHaveValue('1');
    await expect
      .poll(async () => Number(await stepInput(page).inputValue()), { timeout: 5_000 })
      .toBeGreaterThanOrEqual(2);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: /^Play/ })).toBeVisible();
    expect((await settings(page)).speed).toBe(1000);
  });

  test('W7 playing stops at the last step and starts over from there', async ({ page }) => {
    await openFocused(page, { code: SHORT });
    await page.getByLabel('Seconds per step').selectOption('1000');
    await page.getByRole('button', { name: /^Play/ }).click();
    await expect(stepInput(page)).toHaveValue('3', { timeout: 6_000 });
    await expect(page.getByRole('button', { name: /^Play/ })).toBeVisible({ timeout: 3_000 });
    await page.getByRole('button', { name: /^Play/ }).click();
    await expect(stepInput(page)).toHaveValue('1');
    await page.getByRole('button', { name: /^Pause/ }).click();
  });

  test('W8 the overview card says what the flow is and leads on', async ({ page }) => {
    await openFocused(page);
    const overview = page.getByTestId('overview');
    await expect(overview.getByRole('heading', { level: 3 })).toHaveText('Place an order');
    await expect(overview).toContainText(
      `${DEMO_STEPS} steps, 20 layers in 5 chapters. Press → to start, or click any arrow.`,
    );
    await expect(overview).toContainText('Scope: From the click to the confirmation email.');
    await expect(overview).toContainText('Starts when: The shopper presses');
    await expect(overview).toContainText('One request crosses every backend layer once.');
    await page.getByTestId('endings').getByRole('button').first().click();
    await expect(page.getByTestId('step-card')).toBeVisible();
    await page.keyboard.press('Escape');
    await overview.getByRole('button', { name: 'Redis' }).click();
    await expect(notice(page)).toContainText('Redis');
    await page.keyboard.press('Escape');
    await overview.getByRole('button', { name: /side parts/ }).click();
    await expect(page.getByRole('tab', { name: /Side parts/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await closeOverlay(page);
    await overview.getByRole('button', { name: /terms/ }).click();
    await expect(page.getByRole('tab', { name: /Glossary/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('W8 a proposed flow says so on the overview', async ({ page }) => {
    await openFocused(page, { code: `${SHORT}\n  %% @mode proposed` });
    await expect(page.getByTestId('overview')).toContainText(
      "Proposed design. This flow does not exist in the code yet; it follows the project's own patterns.",
    );
    await expect(page.getByTestId('overview').getByText('proposed', { exact: true })).toBeVisible();
  });

  test('W9 H hides every control until Esc and asks for the full screen', async ({ page }) => {
    await openFocused(page);
    await page.keyboard.press('h');
    const show = page.getByRole('button', { name: /Show controls/ });
    await expect(show).toBeVisible();
    await expect(page.locator('#topbar')).toBeHidden();
    await expect(page.locator('#wbar')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Dim others' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Hide the header' })).toBeHidden();
    await expect(page.getByTestId('live')).toHaveText(
      'Controls hidden. Press Escape to show them.',
    );
    const box = await show.boundingBox();
    const viewport = page.viewportSize();
    if (!box || !viewport) throw new Error('No box');
    expect(box.x + box.width).toBeGreaterThan(viewport.width / 2);
    expect(box.y + box.height).toBeGreaterThan(viewport.height / 2);
    await page.keyboard.press('Escape');
    await expect(page.locator('#topbar')).toBeVisible();
    await expect(page.locator('#wbar')).toBeVisible();
    await expect(page.getByTestId('live')).toHaveText('Controls shown');
    await expect.poll(() => fullscreen(page)).toBe(false);
  });

  test('W9 leaving the full screen another way brings the controls back', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'Only Chromium grants the full screen in a test run');
    await openFocused(page);
    await page.keyboard.press('h');
    await expect.poll(() => fullscreen(page)).toBe(true);
    await page.evaluate(() =>
      (
        globalThis as unknown as { document: { exitFullscreen: () => Promise<void> } }
      ).document.exitFullscreen(),
    );
    await expect(page.locator('#topbar')).toBeVisible();
  });

  test('W10 P shows the presenter card, arrows step, Esc leaves', async ({ page }) => {
    await openFocused(page);
    await page.keyboard.press('p');
    const card = page.getByTestId('present-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Place an order');
    await expect(card).toContainText(`${DEMO_STEPS} steps. Press → to start.`);
    await expect(page.locator('#topbar')).toBeHidden();
    await expect(page.getByRole('button', { name: /Show controls/ })).toBeHidden();
    await expect(page.getByTestId('live')).toHaveText(
      'Presenter mode. Arrow keys step, Escape leaves.',
    );
    await page.keyboard.press('ArrowRight');
    await expect(card).toContainText(`Step 1 of ${DEMO_STEPS}`);
    await expect(card).toContainText('Shopper');
    await page.keyboard.press('Escape');
    await expect(card).toBeHidden();
    await expect(page.locator('#topbar')).toBeVisible();
  });

  test('W10 the presenter card shows the speaker note', async ({ page }) => {
    await openFocused(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('n');
    await page.getByTestId('note-ta').fill('say this out loud');
    await page.keyboard.press('Escape');
    await page.keyboard.press('p');
    await expect(page.getByTestId('present-card')).toContainText('Speaker note: say this out loud');
  });

  test('W11 the path filter walks only its steps until Show all or Esc', async ({ page }) => {
    await openFocused(page);
    const select = page.getByTestId('path-select');
    await expect(select).toHaveValue('all');
    await expect(select.locator('option').first()).toHaveText('Path: all steps');
    await expect(select.locator('option').nth(1)).toHaveText('Happy path only');
    await expect(select.locator('option').nth(2)).toHaveText('Errors only');
    await expect(select.locator('optgroup')).toHaveAttribute('label', 'One branch');
    await select.selectOption('happy');
    await expect(notice(page)).toHaveText(/^Path: happy path, \d+ of 42 steps\./);
    expect(await page.getByTestId('progress').locator('[data-hidden]').count()).toBeGreaterThan(0);
    await diagram(page).focus();
    await page.keyboard.press('ArrowRight');
    await expect(stepInput(page)).toHaveValue('1');
    // The first error reply is step 10: on the happy path no card shows a 4xx or 5xx status.
    for (let i = 0; i < 30; i++) {
      const before = await stepInput(page).inputValue();
      await page.keyboard.press('ArrowRight');
      await expect(stepInput(page)).not.toHaveValue(before);
      const status = page.getByTestId('step-card').getByTestId('status');
      if ((await status.count()) > 0) expect(await status.textContent()).not.toMatch(/^[45]\d\d/);
    }
    await notice(page).getByRole('button', { name: 'Show all' }).click();
    await expect(select).toHaveValue('all');
    expect(await page.getByTestId('progress').locator('[data-hidden]').count()).toBe(0);
    await select.selectOption('errors');
    await expect(notice(page)).toHaveText(/^Path: errors only, \d+ of 42 steps\./);
    await diagram(page).focus();
    await page.keyboard.press('Escape');
    await expect(select).toHaveValue('all');
  });

  test('W11 a flow without branches or errors has no path select', async ({ page }) => {
    await openFocused(page, { code: SHORT });
    await expect(page.getByTestId('path-select')).toBeHidden();
  });

  test('W12 Behind lists the side parts and leads to Insight', async ({ page }) => {
    await openFocused(page);
    await page.keyboard.press('ArrowRight');
    await page.getByTestId('behind-btn').click();
    const pop = page.getByRole('dialog', { name: 'Behind the scenes' });
    await expect(pop).toContainText('Parts that take part without being a layer.');
    await expect(pop).toContainText('Step 1 uses 1 hook.');
    await expect(pop.locator('details[open]')).toHaveCount(1);
    await expect(pop.locator('details[open]')).toContainText('hook');
    // The groups are sorted by kind, as version 2 sorted them.
    await expect(pop.locator('details').first()).toContainText('config');
    await pop.getByRole('button', { name: 'Open the full list' }).click();
    await expect(page.getByRole('tab', { name: /Side parts/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('W12 a flow with no side parts has no Behind button', async ({ page }) => {
    await openFocused(page, { code: SHORT });
    await expect(page.getByTestId('behind-btn')).toBeHidden();
  });

  test('W13 the wheel over the step bar steps once per turn', async ({ page }) => {
    await openFocused(page, { code: SHORT });
    await page.getByTestId('card-next').hover();
    await page.mouse.wheel(0, 50);
    await expect(stepInput(page)).toHaveValue('1');
    await page.getByTestId('card-next').hover();
    await page.mouse.wheel(0, 20);
    await page.waitForTimeout(300);
    await expect(stepInput(page)).toHaveValue('1');
    await page.mouse.wheel(0, 50);
    await expect(stepInput(page)).toHaveValue('2');
    await page.mouse.wheel(0, -50);
    await expect(stepInput(page)).toHaveValue('2');
    await page.waitForTimeout(200);
    await page.mouse.wheel(0, -50);
    await expect(stepInput(page)).toHaveValue('1');
  });

  test('W14 the step bar can be dragged taller, by keys too, and reset', async ({ page }) => {
    await openFocused(page);
    const handle = page.getByTestId('wb-resize');
    const card = page.getByTestId('card-cur');
    const before = await card.boundingBox();
    const box = await handle.boundingBox();
    if (!before || !box) throw new Error('No box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 100, { steps: 4 });
    const during = await card.boundingBox();
    expect(during?.height).toBeCloseTo(before.height + 100, -1);
    await page.mouse.up();
    const saved = (await settings(page)).cardH;
    expect(saved).toBeCloseTo(before.height + 100, -1);
    await handle.focus();
    await page.keyboard.press('ArrowUp');
    await expect.poll(async () => (await settings(page)).cardH).toBe((saved ?? 0) + 20);
    await page.reload();
    await expect(svg(page)).toBeVisible({ timeout: 30_000 });
    expect((await card.boundingBox())?.height).toBeCloseTo((saved ?? 0) + 20, -1);
    await handle.dblclick();
    await expect(toastBox(page)).toContainText('Step bar height reset');
    await expect.poll(async () => (await settings(page)).cardH).toBeUndefined();
  });

  test('W15 the fold tabs hide the header and the bar, and it is remembered', async ({ page }) => {
    await openFocused(page);
    await page.getByRole('button', { name: 'Hide the header' }).click();
    await expect(page.locator('#topbar')).toBeHidden();
    const showHeader = page.getByRole('button', { name: 'Show the header' });
    await expect(showHeader).toHaveAttribute('aria-expanded', 'false');
    await page.getByRole('button', { name: 'Hide the step bar' }).click();
    await expect(page.locator('#wbar')).toBeHidden();
    expect((await settings(page)).fold).toEqual({ top: true, bar: true });
    await page.reload();
    await expect(svg(page)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#topbar')).toBeHidden();
    await expect(page.locator('#wbar')).toBeHidden();
    await showHeader.click();
    await page.getByRole('button', { name: 'Show the step bar' }).click();
    await expect(page.locator('#topbar')).toBeVisible();
    await expect(page.locator('#wbar')).toBeVisible();
  });

  test('W15 the left tab exists only while the code is open, and the tabs re-centre', async ({
    page,
  }) => {
    await openFocused(page);
    const left = page.getByRole('button', { name: 'Hide the code' });
    await expect(left).toBeHidden();
    const top = page.getByRole('button', { name: 'Hide the header' });
    const centred = (await top.boundingBox())?.x ?? 0;
    await page.keyboard.press('c');
    await expect(left).toBeVisible();
    await expect.poll(async () => (await top.boundingBox())?.x ?? 0).toBeGreaterThan(centred + 100);
    await left.click();
    await expect(page.locator('#codePanel')).toBeHidden();
    await expect.poll(async () => (await top.boundingBox())?.x ?? 0).toBeCloseTo(centred, 0);
    await diagram(page).focus();
    await page.keyboard.press('i');
    await expect.poll(async () => (await top.boundingBox())?.x ?? 0).toBeLessThan(centred - 100);
  });

  test('W16 the step box jumps on Enter, restores on Esc, selects on focus', async ({ page }) => {
    await openFocused(page);
    await page.keyboard.press('ArrowRight');
    const input = stepInput(page);
    await input.focus();
    const selected = await input.evaluate((el) => {
      const box = el as unknown as { selectionStart: number; selectionEnd: number; value: string };
      return box.selectionStart === 0 && box.selectionEnd === box.value.length;
    });
    expect(selected).toBe(true);
    await input.fill('5');
    await input.press('Enter');
    await expect(page.getByTestId('step-card')).toContainText(`of ${DEMO_STEPS}`);
    await expect(input).toHaveValue('5');
    await input.fill('9');
    await input.press('Escape');
    await expect(input).toHaveValue('5');
    await input.fill('999');
    await input.press('Enter');
    await expect(input).toHaveValue(String(DEMO_STEPS));
  });

  test('W17 Esc closes one thing at a time, in order', async ({ page }) => {
    await openFocused(page);
    // The spotlight first, while the whole drawing is in view and no panel covers it.
    await svg(page).locator('.swv-actor[data-alias="RD"]').first().click();
    await expect(notice(page)).toContainText('Showing only');
    await page.keyboard.press('i');
    await expect(page.getByTestId('insight')).toBeVisible();
    await page.keyboard.press('c');
    await expect(page.locator('#codePanel')).toBeVisible();
    await diagram(page).focus();
    await goToStep(page, 4);
    await page.getByTestId('path-select').selectOption('happy');
    await diagram(page).focus();
    await page.keyboard.press('n');
    await expect(page.getByTestId('note-ta')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('note-ta')).toBeHidden();
    await diagram(page).focus();
    await page.keyboard.press('/');
    await expect(page.getByTestId('find')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('find')).toBeHidden();
    await expect(notice(page)).toContainText('Showing only');
    await page.keyboard.press('Escape');
    await expect(notice(page)).toContainText('Path:');
    await page.keyboard.press('Escape');
    await expect(notice(page)).toBeHidden();
    await expect(page.getByTestId('insight')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('insight')).toBeHidden();
    await expect(page.locator('#codePanel')).toBeVisible();
    await diagram(page).focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('#codePanel')).toBeHidden();
    await expect(stepInput(page)).toBeVisible();
    await diagram(page).focus();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('overview')).toBeVisible();
  });

  test('W17 Follow closes before Insight', async ({ page }) => {
    await openFocused(page);
    await page.keyboard.press('i');
    await goToStep(page, 4);
    await page.getByTestId('step-card').locator('[data-tok]').first().click();
    const strip = page.getByTestId('follow-strip');
    await expect(strip).toBeVisible();
    await diagram(page).focus();
    await page.keyboard.press('Escape');
    await expect(strip).toBeHidden();
    await expect(page.getByTestId('insight')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('insight')).toBeHidden();
  });

  test('W18 a toast stays about three seconds and the next replaces it', async ({ page }) => {
    await open(page, { clipboard: true });
    await diagram(page).focus();
    await page.keyboard.press('c');
    await page.getByRole('button', { name: 'Copy code' }).click();
    await expect(toastBox(page)).toHaveText('Copied the code');
    await expect(toastBox(page)).toHaveAttribute('role', 'status');
    await page.getByRole('button', { name: 'Load example' }).click();
    await expect(toastBox(page)).toHaveText('Loaded the example flow');
    await expect(toastBox(page).getByText('Copied the code')).toHaveCount(0);
    await expect(toastBox(page).getByText('Loaded the example flow')).toHaveCount(0, {
      timeout: 4_500,
    });
  });

  test('W19 W20 the canvas row, the dock and the header have their controls and the notice its Show all', async ({
    page,
  }) => {
    await openFocused(page);
    for (const name of [
      /Code/,
      /^Play/,
      'Dim others',
      'Chapter band',
      'Analyze',
      'Hide controls',
    ]) {
      await expect(
        page.getByRole('button', { name, exact: typeof name === 'string' }).first(),
      ).toBeVisible();
    }
    await expect(page.getByLabel('Seconds per step')).toBeVisible();
    await page.getByTestId('path-select').selectOption('happy');
    await expect(notice(page).getByRole('button', { name: 'Show all' })).toBeVisible();
  });

  test('P1 P2 a bookmark and a note survive a reload in the old keys', async ({ page }) => {
    await openFocused(page);
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('bm-btn')).toContainText('★ 0');
    await page.keyboard.press('b');
    await expect(page.getByTestId('bm-btn')).toContainText('★ 1');
    await expect(page.getByTestId('star-btn')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('live')).toHaveText('Step 1 bookmarked');
    await page.keyboard.press('n');
    const editor = page.getByTestId('note-ta');
    await expect(editor).toBeFocused();
    await expect(editor).toHaveAttribute('placeholder', 'Your note (only in this browser)');
    await editor.fill('hello from the test');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('note-view')).toContainText('hello from the test');
    await page.reload();
    await expect(page.getByTestId('overview')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('bm-btn')).toContainText('★ 1');
    await diagram(page).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('note-view')).toContainText('hello from the test');
    const stored = await page.evaluate((key) => localStorage.getItem(key), DEMO_NOTES_KEY);
    expect(stored).toContain('hello from the test');
    expect(stored).toContain('"star":true');
    await page.keyboard.press('b');
    await expect(page.getByTestId('live')).toHaveText('Bookmark removed from step 1');
  });

  test('the step bar has no accessibility violations', async ({ page }) => {
    await openFocused(page);
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('step-card')).toBeVisible();
    await expectNoAxeViolations(page);
  });
});
