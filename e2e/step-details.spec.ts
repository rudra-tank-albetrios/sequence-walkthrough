import { expect, test, type Page } from '@playwright/test';

import {
  demoFlow,
  diagram,
  fixture,
  goToStep,
  open,
  openFocused,
  rightClickWord,
  stepInput,
  svg,
  toastBox,
} from './helpers.ts';

const card = (page: Page) => page.getByTestId('step-card');

test.describe('step details', () => {
  test('S1 the header row has the count, chapter, branch and flag chips and actions', async ({
    page,
  }) => {
    await openFocused(page, { code: fixture('payment-idempotency-detailed') });
    await goToStep(page, 3);
    await expect(card(page)).toContainText('of 18');
    await expect(card(page).getByText('idempotent', { exact: false }).first()).toBeVisible();
    await expect(card(page).getByText(/^timeout/)).toBeVisible();
    await goToStep(page, 15);
    const branch = card(page).locator('b', { hasText: /^(alt|else)$/ });
    await expect(branch).toHaveCount(2);
    await expect(card(page).getByRole('button', { name: /ask/i }).first()).toBeVisible();
    await expect(page.getByTestId('star-btn')).toBeVisible();
    await expect(card(page).getByRole('button', { name: /note/i }).first()).toBeVisible();
    await goToStep(page, 7);
    await expect(card(page).getByText(/^retry/)).toBeVisible();
    await openFocused(page, { code: demoFlow() });
    await goToStep(page, 28);
    await expect(card(page).getByText(/^async/)).toBeVisible();
    await expect(card(page).getByText(/6 of \d+ in Save the order/)).toBeVisible();
  });

  test('S1 unconfirmed and proposed show as chips', async ({ page }) => {
    await openFocused(page, {
      code: 'sequenceDiagram\n  %% @mode proposed\n  %% @unconfirmed Which queue is used\n  A->>B: one',
    });
    await page.keyboard.press('ArrowRight');
    const chip = card(page).getByText('unconfirmed', { exact: true });
    await expect(chip).toHaveAttribute('title', 'Which queue is used');
    await expect(card(page).getByText('proposed', { exact: true })).toBeVisible();
  });

  test('S2 the route line names both ends and a reply links its request', async ({ page }) => {
    await openFocused(page);
    await goToStep(page, 4);
    await expect(card(page)).toContainText('API Client');
    await expect(card(page)).toContainText('──►');
    await expect(card(page).getByText('request', { exact: true })).toBeVisible();
    await goToStep(page, 11);
    await expect(card(page)).toContainText('↻ itself');
    await expect(card(page).getByText('self', { exact: true })).toBeVisible();
    await goToStep(page, 33);
    await expect(card(page).getByText('reply', { exact: true })).toBeVisible();
    const pair = page.getByTestId('pair-chip');
    await expect(pair).toHaveText(/^answers step 4: POST \/api\/orders/);
    await pair.click();
    await expect(stepInput(page)).toHaveValue('4');
  });

  test('S3 S4 a reply shows its status code, its meaning, and following words', async ({
    page,
  }) => {
    await openFocused(page);
    await goToStep(page, 22);
    const status = page.getByTestId('status');
    await expect(status).toHaveText('409');
    await expect(status).toHaveAttribute('title', /^Conflict:/);
    await expect(status).toHaveClass(/s4xx/);
    await expect(page.getByTestId('status-note')).toHaveText(/^Conflict: the request clashes/);
    await goToStep(page, 4);
    await expect(card(page).locator('[data-tok="POST"]').first()).toBeVisible();
  });

  test('S5 the chapter summary shows on the chapter first step only', async ({ page }) => {
    await openFocused(page);
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('chapter-summary')).toContainText('Check the request:');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('chapter-summary')).toBeHidden();
  });

  test('S6 a step without explanation says so', async ({ page }) => {
    await openFocused(page, {
      code: 'sequenceDiagram\n  actor A as Alice\n  participant B as Bob\n  A->>B: hi\n  B->>B: think',
    });
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('explain')).toHaveText(
      'Sends this from Alice to Bob. No explanation yet.',
    );
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('explain')).toHaveText(
      'Bob works on its own here. No explanation yet.',
    );
  });

  test('S7 a request lists its replies, or says it has none', async ({ page }) => {
    await openFocused(page);
    await goToStep(page, 4);
    const replies = page.getByTestId('replies');
    await expect(replies).toContainText('Replies:');
    await expect(replies).toContainText('401 Unauthorized');
    await expect(replies).toContainText('201 Created');
    await replies.getByRole('button', { name: /201 Created/ }).click();
    await expect(stepInput(page)).toHaveValue('33');
    await openFocused(page, { code: 'sequenceDiagram\n  A->>B: GET /users' });
    await page.keyboard.press('ArrowRight');
    await expect(card(page)).toContainText('No reply arrow for this request yet.');
  });

  test('S8 the payload opens to labelled parts', async ({ page }) => {
    await openFocused(page);
    await goToStep(page, 4);
    const payload = page.getByTestId('payload');
    await expect(payload.getByText('Body', { exact: true })).toBeHidden();
    await payload.getByText('Show payload').click();
    // Two @payload.headers lines give two labelled boxes, as version 2 drew them.
    await expect(payload.getByText('Headers', { exact: true })).toHaveCount(2);
    await expect(payload.getByText('Headers', { exact: true }).first()).toBeVisible();
    await expect(payload.getByText('Body', { exact: true })).toBeVisible();
    await expect(payload).toContainText('Authorization: Bearer demo-token');
    await goToStep(page, 7);
    await page.getByTestId('payload').getByText('Show payload').click();
    await expect(page.getByTestId('payload').getByText('SQL', { exact: true })).toBeVisible();
  });

  test('S9 a reply compares its body with the request', async ({ page }) => {
    await openFocused(page, {
      code: [
        'sequenceDiagram',
        '  %% @payload.body {"a":1,"b":2,"c":3}',
        '  A->>B: POST /things',
        '  %% @payload.body {"a":1,"b":5,"d":4}',
        '  B-->>A: 201 Created',
      ].join('\n'),
    });
    await goToStep(page, 2);
    const diff = page.getByTestId('diff');
    await expect(diff).toContainText('Compared with the request body:');
    await expect(diff).toContainText('+ d');
    await expect(diff).toContainText('~ b');
    await expect(diff).toContainText('− c');
  });

  test('S10 S11 schema and state', async ({ page }) => {
    await openFocused(page);
    await goToStep(page, 11);
    const schema = card(page).locator('summary', { hasText: 'Schema (7)' });
    await expect(schema).toBeVisible();
    await schema.click();
    await expect(card(page).locator('td', { hasText: 'shippingAddress.line1' })).toBeVisible();
    await goToStep(page, 19);
    const state = page.getByTestId('state');
    await expect(state.locator('pre')).toHaveCount(2);
    await expect(state).toContainText('Before');
    await expect(state).toContainText('After');
    await expect(state).toContainText('stock:p_1 = 10, no hold');
  });

  test('S11 a missing side of the state shows a dash', async ({ page }) => {
    await openFocused(page, {
      code: 'sequenceDiagram\n  %% @state after one row\n  A->>B: insert',
    });
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('state').locator('pre').first()).toHaveText('—');
  });

  test('S12 S13 fields link to steps and effects show as chips', async ({ page }) => {
    await openFocused(page, { code: fixture('sections-start') });
    await page.keyboard.press('End');
    await page.keyboard.press('Home');
    const label = page.getByTestId('fields');
    for (let i = 0; i < 12 && !(await label.isVisible()); i++) {
      await page.keyboard.press('ArrowRight');
    }
    await expect(label.locator('code')).toHaveText(['id']);
    await label.getByRole('button', { name: 'step 3' }).click();
    await expect(stepInput(page)).toHaveValue('3');
    await openFocused(page, { code: demoFlow() });
    await goToStep(page, 28);
    await expect(page.getByTestId('effects')).toContainText(
      'A confirmation job is queued for the mail worker',
    );
  });

  test('S14 a code reference is a plain chip, a web address a safe link', async ({ page }) => {
    await openFocused(page);
    await goToStep(page, 4);
    const ref = card(page).getByTitle('Source').first();
    await expect(ref).toHaveText('src/frontend/api/client.ts:60');
    await openFocused(page, { code: fixture('v1-format') });
    await page.keyboard.press('ArrowRight');
    for (let i = 0; i < 6; i++) {
      if (await card(page).locator('a[target="_blank"]').count()) break;
      await page.keyboard.press('ArrowRight');
    }
    const link = card(page).locator('a[target="_blank"]').first();
    await expect(link).toHaveText('example.com/docs/home');
    await expect(link).toHaveAttribute('rel', /noopener/);
    await expect(link).toHaveAttribute('href', 'https://example.com/docs/home');
  });

  test('S15 S16 unconfirmed lines and the side parts of a step', async ({ page }) => {
    await openFocused(page, {
      code: [
        'sequenceDiagram',
        '  %% @unconfirmed Which queue is used',
        '  %% @uses hook useThing src/a.ts:1 Does the thing.',
        '  %% @uses util other src/b.ts:2 Does the other.',
        '  A->>B: one',
      ].join('\n'),
    });
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('unconfirmed')).toContainText(
      'Not confirmed: Which queue is used',
    );
    const uses = page.getByTestId('uses');
    await expect(uses.locator('summary')).toHaveText('Also involved: 1 hook · 1 util');
    await uses.locator('summary').click();
    await expect(uses.locator('li')).toHaveCount(2);
    await expect(uses).toContainText('useThing');
    await expect(uses).toContainText('src/a.ts:1');
    await expect(uses).toContainText('Does the thing.');
  });

  test('S17 a glossary word opens its definition, also from Insight', async ({ page }) => {
    await openFocused(page, {
      code: [
        'sequenceDiagram',
        '  %% @term widget: a small part of the thing.',
        '  %% @layer A The widget owner.',
        '  %% @step Sends the widget across.',
        '  A->>B: one',
      ].join('\n'),
    });
    await page.keyboard.press('ArrowRight');
    await page.getByTestId('explain').getByRole('button', { name: 'widget' }).click();
    const pop = page.getByTestId('term-pop');
    await expect(pop).toContainText('a small part of the thing.');
    await expect(pop.getByRole('button', { name: 'Ask AI more' })).toBeVisible();
    await expect(pop.getByRole('button', { name: 'Delete' })).toBeHidden();
    await pop.getByRole('button', { name: 'Follow in the flow' }).click();
    await expect(page.getByTestId('follow-strip')).toContainText('widget');
    await expect(pop).toBeHidden();
    await page.keyboard.press('i');
    await page.getByTestId('insight').getByRole('button', { name: 'widget' }).first().click();
    await expect(pop).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(pop).toBeHidden();
    await expect(page.getByTestId('insight')).toBeVisible();
  });

  test('S18 following a value finds it in every step and walks them', async ({ page }) => {
    await openFocused(page, {
      code: 'sequenceDiagram\n  A->>B: order placed\n  B-->>A: 200 order\n  A->>B: finish\n  B->>A: order done',
    });
    await page.keyboard.press('ArrowRight');
    await card(page).locator('[data-tok="order"]').first().click();
    const strip = page.getByTestId('follow-strip');
    await expect(strip).toContainText('order appears in steps');
    await expect(strip.getByRole('button', { name: /Go to step/ })).toHaveText(['1', '2', '4']);
    await expect(svg(page).locator('.swv-follow')).toHaveCount(3);
    await expect(page.getByTestId('live')).toHaveText('order appears in steps 1, 2, 4');
    await expect(card(page).locator('[data-tok="order"]').first()).toHaveClass(/on/);
    await strip.getByRole('button', { name: 'Next step with this value' }).click();
    await expect(stepInput(page)).toHaveValue('2');
    await strip.getByRole('button', { name: 'Next step with this value' }).click();
    await expect(stepInput(page)).toHaveValue('4');
    await strip.getByRole('button', { name: 'Next step with this value' }).click();
    await expect(stepInput(page)).toHaveValue('1');
    await strip.getByRole('button', { name: 'Previous step with this value' }).click();
    await expect(stepInput(page)).toHaveValue('4');
    await strip.getByRole('button', { name: 'Go to step 2' }).click();
    await expect(stepInput(page)).toHaveValue('2');
    await strip.getByRole('button', { name: 'Stop following' }).click();
    await expect(strip).toBeHidden();
  });

  test('S19 right-click on one selected word offers Follow and Ask, otherwise nothing', async ({
    page,
  }) => {
    await open(page);
    await diagram(page).focus();
    await page.keyboard.press('ArrowRight');
    await rightClickWord(page, 'explain', 'shopper');
    const menu = page.getByTestId('ctx');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem')).toHaveText([
      'Follow “shopper”',
      'Ask AI: what is “shopper”?',
    ]);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await rightClickWord(page, 'explain', 'the');
    await expect(menu).toBeHidden();
    await rightClickWord(page, 'explain', 'shopper');
    await menu.getByRole('menuitem').first().click();
    await expect(page.getByTestId('follow-strip')).toContainText('shopper');
  });

  test('S18 a word too short or not there is refused with a toast', async ({ page }) => {
    await openFocused(page, {
      code: 'sequenceDiagram\n  %% @term zz: a short word.\n  %% @term absent: not in any step.\n  %% @step The absent thing and zz are named here only.\n  A->>B: one',
    });
    await page.keyboard.press('ArrowRight');
    await page.getByTestId('explain').getByRole('button', { name: 'zz' }).click();
    await page.getByTestId('term-pop').getByRole('button', { name: 'Follow in the flow' }).click();
    await expect(toastBox(page)).toContainText('“zz” is too short or too common to follow');
  });
});
