import { expect, test, type Page } from '@playwright/test';

import {
  DEMO_STEPS,
  DEMO_TITLE,
  camera,
  diagram,
  fixture,
  goToStep,
  heading,
  notice,
  openFocused,
  seed,
  stepInput,
  svg,
} from './helpers.ts';

const sized = async (page: Page) => {
  const box = await svg(page).boundingBox();
  const canvas = await diagram(page).boundingBox();
  if (!box || !canvas) throw new Error('The diagram has no box');
  return { box, canvas };
};

const overCanvas = async (page: Page) => {
  const { canvas } = await sized(page);
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  return canvas;
};

/** The current arrow's on-screen box. */
const curLine = (page: Page) =>
  svg(page).locator('.messageLine0.swv-cur, .messageLine1.swv-cur').first();

test.describe('diagram', () => {
  test('D1 renders one drawing with the title and the status line', async ({ page }) => {
    await openFocused(page);
    await expect(heading(page)).toHaveText(DEMO_TITLE);
    await expect(page.getByTestId('layer').locator('svg')).toHaveCount(1);
    const lines = svg(page).locator('.messageLine0[data-step], .messageLine1[data-step]');
    await expect(lines).toHaveCount(DEMO_STEPS);
    await expect(svg(page).locator('.swv-actor[data-alias="SVC"]').first()).toBeAttached();
    await page.keyboard.press('c');
    await expect(page.locator('#codePanel [data-status="ok"]')).toHaveText(
      new RegExp(`^${DEMO_STEPS} steps · Rendered in \\d+ ms · Mermaid 12\\.2\\.0$`),
    );
  });

  test('D1 typing draws again after a moment', async ({ page }) => {
    await openFocused(page, { code: 'sequenceDiagram\n  A->>B: one' });
    await page.keyboard.press('c');
    const code = page.locator('#code');
    await code.press('Control+End');
    await code.pressSequentially('\n  B-->>A: two');
    await expect(svg(page).locator('.messageLine1[data-step="1"]')).toBeAttached();
    await expect(svg(page).getByText('two', { exact: true })).toBeVisible();
  });

  test('D2 a syntax error keeps the last drawing and says where it is', async ({ page }) => {
    await openFocused(page, { code: 'sequenceDiagram\n  A->>B: one' });
    await page.keyboard.press('c');
    await page.locator('#code').fill('sequenceDiagram\n  A->>B: one\n  A->>');
    const badge = page.getByTestId('err-badge');
    await expect(badge).toContainText('Syntax error on line 3.');
    await expect(badge).toContainText('Showing the last good diagram.');
    await expect(svg(page).getByText('one', { exact: true })).toBeVisible();
    await expect(page.getByTestId('code-count')).toHaveText('error');
    await expect(page.locator('#codePanel [data-status="error"]')).toContainText(
      'Line 3: Syntax error.',
    );
    await expect(page.locator('#codePanel [data-line="2"][data-err]')).toBeAttached();
  });

  test('D2 a first drawing that fails says so without "last good"', async ({ page }) => {
    await seed(page, { 'swv:code': JSON.stringify('sequenceDiagram\n  A->>') });
    await page.goto('/');
    const badge = page.getByTestId('err-badge');
    await expect(badge).toContainText('Syntax error', { timeout: 30_000 });
    await expect(badge).not.toContainText('Showing the last good diagram');
  });

  test('D3 dragging moves the diagram, a small move does not', async ({ page }) => {
    await openFocused(page);
    await page.getByTitle('Set zoom to 100%').click();
    const canvas = await overCanvas(page);
    const before = await camera(page);
    await page.mouse.down();
    await page.mouse.move(canvas.x + canvas.width / 2 + 3, canvas.y + canvas.height / 2);
    await page.mouse.up();
    expect((await camera(page)).x).toBe(before.x);
    await overCanvas(page);
    await page.mouse.down();
    await page.mouse.move(canvas.x + canvas.width / 2 - 120, canvas.y + canvas.height / 2 + 5, {
      steps: 5,
    });
    await page.mouse.up();
    const moved = await camera(page);
    expect(moved.x).toBeCloseTo(before.x - 120, 0);
  });

  test('D4 the wheel and the up and down keys scroll', async ({ page }) => {
    await openFocused(page);
    await overCanvas(page);
    const start = await camera(page);
    await page.mouse.wheel(0, 100);
    await expect.poll(async () => (await camera(page)).y).toBeCloseTo(start.y - 100, 0);
    const scrolled = await camera(page);
    await page.keyboard.press('ArrowDown');
    await expect.poll(async () => (await camera(page)).y).toBeCloseTo(scrolled.y - 80, 0);
    await page.keyboard.press('ArrowUp');
    await expect.poll(async () => (await camera(page)).y).toBeCloseTo(scrolled.y, 0);
  });

  test('D5 plus and minus zoom, the percentage sets 100, the range stops at 8', async ({
    page,
  }) => {
    await openFocused(page);
    const pct = page.getByTitle('Set zoom to 100%');
    const start = await camera(page);
    await page.keyboard.press('+');
    await expect.poll(async () => (await camera(page)).k).toBeCloseTo(start.k * 1.25, 3);
    await page.keyboard.press('=');
    await expect.poll(async () => (await camera(page)).k).toBeCloseTo(start.k * 1.25 ** 2, 3);
    await page.keyboard.press('-');
    await expect.poll(async () => (await camera(page)).k).toBeCloseTo(start.k * 1.25, 3);
    await page.keyboard.press('_');
    await expect.poll(async () => (await camera(page)).k).toBeCloseTo(start.k, 3);
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect(pct).toHaveText(`${Math.round(start.k * 125)}%`);
    await pct.click();
    await expect(pct).toHaveText('100%');
    await overCanvas(page);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -100);
    await page.keyboard.up('Control');
    await expect.poll(async () => (await camera(page)).k).toBeGreaterThan(1);
    await diagram(page).focus();
    for (let i = 0; i < 20; i++) await page.keyboard.press('+');
    await expect.poll(async () => (await camera(page)).k).toBe(8);
  });

  test('D6 the wheel button makes a plain wheel zoom and is remembered', async ({ page }) => {
    await openFocused(page);
    const wheel = page.getByRole('button', { name: 'Wheel: Scroll' });
    await expect(wheel).toHaveAttribute(
      'title',
      'The wheel scrolls; Ctrl + wheel zooms. Click to zoom with the wheel.',
    );
    await wheel.click();
    const zoomMode = page.getByRole('button', { name: 'Wheel: Zoom' });
    await expect(zoomMode).toHaveAttribute('aria-pressed', 'true');
    await expect(zoomMode).toHaveAttribute(
      'title',
      'The wheel zooms like mermaid.live. Click to scroll instead.',
    );
    await overCanvas(page);
    const before = await camera(page);
    await page.mouse.wheel(0, -100);
    await expect.poll(async () => (await camera(page)).k).toBeGreaterThan(before.k);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Wheel: Zoom' })).toBeVisible();
  });

  test('D7 zero fits the width, F fits everything', async ({ page }) => {
    await openFocused(page, { code: fixture('payment-idempotency') });
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await diagram(page).focus();
    await page.keyboard.press('0');
    await expect
      .poll(async () => {
        const { box, canvas } = await sized(page);
        return Math.abs(box.width - (canvas.width - 48));
      })
      .toBeLessThan(2);
    await page.keyboard.press('f');
    await expect
      .poll(async () => {
        const { box, canvas } = await sized(page);
        return (
          box.x >= canvas.x - 1 &&
          box.y >= canvas.y - 1 &&
          box.x + box.width <= canvas.x + canvas.width + 1 &&
          box.y + box.height <= canvas.y + canvas.height + 1
        );
      })
      .toBe(true);
  });

  test('D8 the camera brings the current arrow into view', async ({ page }) => {
    await openFocused(page);
    await page.keyboard.press('End');
    await expect(stepInput(page)).toHaveValue(String(DEMO_STEPS));
    await expect
      .poll(async () => {
        const line = await curLine(page).boundingBox();
        const canvas = await diagram(page).boundingBox();
        if (!line || !canvas) return false;
        return line.y >= canvas.y && line.y + line.height <= canvas.y + canvas.height;
      })
      .toBe(true);
  });

  test('D9 the grid button switches the dots and is remembered', async ({ page }) => {
    await openFocused(page);
    const backgroundImage = () =>
      diagram(page).evaluate(
        (el) =>
          (
            globalThis as unknown as {
              getComputedStyle: (e: unknown) => { backgroundImage: string };
            }
          ).getComputedStyle(el).backgroundImage,
      );
    expect(await backgroundImage()).toContain('radial-gradient');
    await page.keyboard.press('c');
    const grid = page.getByRole('button', { name: 'Grid' });
    await expect(grid).toHaveAttribute('aria-pressed', 'true');
    await grid.click();
    await expect(grid).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(backgroundImage).toBe('none');
    await page.reload();
    await expect(svg(page)).toBeVisible({ timeout: 30_000 });
    expect(await backgroundImage()).toBe('none');
  });

  test('D10 the theme list has eight names and the choice redraws and stays', async ({ page }) => {
    await openFocused(page);
    const select = page.locator('#themeSel');
    await expect(select.locator('option')).toHaveText([
      'redux-color',
      'redux',
      'redux-dark',
      'redux-dark-color',
      'default',
      'dark',
      'neutral',
      'forest',
    ]);
    await expect(select).toHaveValue('redux-color');
    const background = () =>
      diagram(page).evaluate((el) =>
        (
          el as unknown as { style: { getPropertyValue: (n: string) => string } }
        ).style.getPropertyValue('--canvas-bg'),
      );
    const light = await background();
    await select.selectOption('dark');
    await expect.poll(background).not.toBe(light);
    await expect(svg(page)).toBeVisible();
    const stored = await page.evaluate(
      () => JSON.parse(localStorage.getItem('swv:settings') ?? '{}') as { theme?: string },
    );
    expect(stored.theme).toBe('dark');
    await page.reload();
    await expect(select).toHaveValue('dark');
  });

  test('D11 the participant row stays pinned while scrolling and in no other case', async ({
    page,
  }) => {
    await openFocused(page);
    const header = page.getByTestId('pinned-header');
    await expect(header).toBeHidden();
    await page.getByTitle('Set zoom to 100%').click();
    await overCanvas(page);
    await page.mouse.wheel(0, 900);
    await expect(header).toBeVisible();
    await expect(header.locator('svg[id$="-hdr"]')).toBeVisible();
    await expect(header.locator('.swv-actor')).not.toHaveCount(0);
    await page.mouse.wheel(0, -50_000);
    await expect(header).toBeHidden();
  });

  test('D12 D17 the current step gets halos, marker, pill, ring and its class', async ({
    page,
  }) => {
    await openFocused(page);
    await page.keyboard.press('ArrowRight');
    await expect(svg(page).locator('.swv-halo')).toHaveCount(4);
    await expect(svg(page).locator('.swv-marker')).toHaveCount(1);
    await expect(svg(page).locator('.swv-pill')).toHaveCount(1);
    await expect(svg(page).locator('.swv-ring')).toHaveCount(1);
    await expect(svg(page).locator('[data-step="0"].swv-cur').first()).toBeAttached();
    await page.keyboard.press('ArrowRight');
    await expect(svg(page).locator('[data-step="1"].swv-cur').first()).toBeAttached();
    await expect(svg(page).locator('[data-step="0"].swv-cur')).toHaveCount(0);
    await page.keyboard.press('ArrowLeft');
    await expect(svg(page).locator('[data-step="0"].swv-cur').first()).toBeAttached();
  });

  test('D13 hovering a participant shows its layer text', async ({ page }) => {
    await openFocused(page);
    await svg(page).locator('.swv-actor[data-alias="RD"]').first().hover({ force: true });
    const tip = page.getByTestId('arrow-tooltip');
    await expect(tip).toContainText('Redis');
    await expect(tip).toContainText('stock counters and per-order holds');
    await expect(tip).toContainText('Click to show only its arrows');
  });

  test('D14 a click on a participant shows only its arrows until Show all or Esc', async ({
    page,
  }) => {
    await openFocused(page);
    const actor = svg(page).locator('.swv-actor[data-alias="RD"]').first();
    await actor.click({ force: true });
    await expect(notice(page)).toHaveText(/^Showing only the \d+ arrows of Redis\./);
    await expect(svg(page).locator('[data-step].swv-out').first()).toBeAttached();
    await expect(svg(page)).toHaveClass(/swv-spot/);
    await page.getByRole('button', { name: 'Show all' }).click();
    await expect(svg(page).locator('[data-step].swv-out')).toHaveCount(0);
    await actor.click({ force: true });
    await expect(notice(page)).toBeVisible();
    await actor.click({ force: true });
    await expect(notice(page)).toBeHidden();
    await actor.click({ force: true });
    await expect(notice(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(notice(page)).toBeHidden();
  });

  test('D15 hovering an arrow summarises the step', async ({ page }) => {
    await openFocused(page);
    await svg(page).locator('.swv-hit[data-step="3"]').first().hover({ force: true });
    const tip = page.getByTestId('arrow-tooltip');
    await expect(tip).toContainText('Step 4');
    await expect(tip).toContainText('Check the request');
    await expect(tip).toContainText('The client posts the order as JSON');
    await expect(tip).toContainText('Replies');
    await expect(tip).toContainText('Headers');
    await expect(tip).toContainText('Code');
    await expect(tip).toContainText('src/frontend/api/client.ts:50');
    await expect(tip).toContainText('Click the arrow for the full card');
  });

  test('D16 a click on an arrow goes to its step, a drag does not', async ({ page }) => {
    await openFocused(page);
    const hit = svg(page).locator('.swv-hit[data-step="3"]').first();
    await hit.click({ force: true });
    await expect(svg(page).locator('[data-step="3"].swv-cur').first()).toBeAttached();
    await expect(stepInput(page)).toHaveValue('4');
    await page.keyboard.press('Home');
    await expect(stepInput(page)).toHaveValue('1');
    await page.getByTitle('Set zoom to 100%').click();
    const start = await svg(page).locator('.swv-hit[data-step="3"]').first().boundingBox();
    if (!start) throw new Error('The arrow has no box');
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(start.x + start.width / 2 + 60, start.y + start.height / 2 + 60, {
      steps: 4,
    });
    await page.mouse.up();
    await expect(stepInput(page)).toHaveValue('1');
  });

  test('D18 replies of the current request get dashed rings', async ({ page }) => {
    await openFocused(page);
    await goToStep(page, 4);
    const replies = await page.getByTestId('replies').getByRole('button').count();
    expect(replies).toBeGreaterThan(0);
    await expect(svg(page).locator('.swv-pair')).toHaveCount(replies);
  });

  test('D19 Dim others fades the rest and is remembered', async ({ page }) => {
    await openFocused(page);
    await page.keyboard.press('ArrowRight');
    const dim = page.getByRole('button', { name: 'Dim others' });
    await dim.click();
    await expect(dim).toHaveAttribute('aria-pressed', 'true');
    await expect(svg(page)).toHaveClass(/swv-dim/);
    await expect(
      svg(page).locator('.messageLine0[data-step="5"], .messageLine1[data-step="5"]'),
    ).toHaveCSS('opacity', '0.2');
    await page.reload();
    await expect(dim).toHaveAttribute('aria-pressed', 'true');
  });

  test('D20 the chapter band marks the chapter and can be switched off', async ({ page }) => {
    await openFocused(page);
    await page.keyboard.press('ArrowRight');
    await expect(svg(page).locator('rect.swv-band')).toHaveCount(2);
    await expect(svg(page).locator('.swv-band-label').first()).toHaveText(
      /^▶ Check the request · \d+ steps/,
    );
    await expect(svg(page)).toHaveClass(/swv-chap/);
    await page.getByRole('button', { name: 'Chapter band' }).click();
    await expect(svg(page).locator('.swv-band')).toHaveCount(0);
    const stored = await page.evaluate(
      () => JSON.parse(localStorage.getItem('swv:settings') ?? '{}') as { bands?: boolean },
    );
    expect(stored.bands).toBe(false);
  });

  test('D21 trust-boundary lines come from the layer kinds', async ({ page }) => {
    await openFocused(page, { code: fixture('payment-idempotency') });
    await expect(svg(page).locator('line.swv-boundary').first()).toBeAttached();
    await expect(svg(page).locator('text.swv-boundary').first()).toHaveText(/│/);
    await page.keyboard.press('c');
    await page.locator('#code').fill(fixture('no-annotations'));
    await expect(svg(page).locator('.swv-boundary')).toHaveCount(0);
  });

  test('D22 D25 double-clicking a word follows it with a ring on every hit', async ({ page }) => {
    await openFocused(page, {
      code: 'sequenceDiagram\n  A->>B: order placed\n  B-->>A: 200 order\n  A->>B: finish',
    });
    const text = svg(page).locator('.messageText[data-step="0"]').first();
    // From the page, because Playwright's boundingBox is off for SVG text on WebKit.
    const box = await text.evaluate((el) => {
      const label = el as unknown as {
        getBoundingClientRect: () => Record<'x' | 'y' | 'height', number>;
      };
      const { x, y, height } = label.getBoundingClientRect();
      return { x, y, height };
    });
    await page.mouse.dblclick(box.x + 5, box.y + box.height / 2);
    const strip = page.getByTestId('follow-strip');
    await expect(strip).toContainText('order');
    await expect(svg(page).locator('.swv-follow')).toHaveCount(2);
  });

  test('D23 a bookmark and a note each leave their mark on the arrow', async ({ page }) => {
    await openFocused(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('b');
    await expect(svg(page).locator('text.swv-star')).toHaveText(['★']);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('n');
    await page.getByTestId('note-ta').fill('a note');
    await page.keyboard.press('Escape');
    await expect(svg(page).locator('text.swv-star')).toHaveText(['★', '✎']);
  });

  test('D24 a path filter fades the arrows outside it', async ({ page }) => {
    await openFocused(page);
    await page.getByTestId('path-select').selectOption('happy');
    await expect(svg(page)).toHaveClass(/swv-path/);
    await expect(svg(page).locator('.swv-off').first()).toBeAttached();
    await page.getByTestId('path-select').selectOption('all');
    await expect(svg(page).locator('.swv-off')).toHaveCount(0);
  });

  test('D26 slash opens Find, Enter walks the hits, Esc closes and clears', async ({ page }) => {
    await openFocused(page);
    await page.keyboard.press('/');
    const input = page.getByPlaceholder('Find in labels and explanations');
    await expect(input).toBeFocused();
    await input.fill('stock');
    const count = page.getByTestId('find-count');
    await expect(count).toHaveText(/^1 of \d+$/);
    await expect(page.getByTestId('step-card')).toContainText(/stock/i);
    await input.press('Enter');
    await expect(count).toHaveText(/^2 of \d+$/);
    await input.press('Shift+Enter');
    await expect(count).toHaveText(/^1 of \d+$/);
    await input.fill('no such word anywhere');
    await expect(count).toHaveText('No match');
    await input.press('Escape');
    await expect(page.getByTestId('find')).toBeHidden();
    await expect(diagram(page)).toBeFocused();
    await page.keyboard.press('/');
    await expect(input).toHaveValue('');
  });

  test('D27 a non-sequence diagram draws with pan and zoom only', async ({ page }) => {
    await openFocused(page, { code: fixture('not-sequence') });
    await expect(notice(page)).toHaveText(
      'This is a flowchart diagram. The walkthrough, pinned header and table work with sequence diagrams, so only pan and zoom are on.',
    );
    await expect(page.getByTestId('chapters')).toBeHidden();
    const start = await camera(page);
    await page.keyboard.press('+');
    await expect.poll(async () => (await camera(page)).k).toBeCloseTo(start.k * 1.25, 3);
  });

  test('D28 says so when Mermaid cannot be loaded', async ({ page }) => {
    // Only the page's own entry may load: the drawing library comes in a later chunk.
    await page.route(/\/assets\/.*\.js$/, async (route) => {
      if (/\/assets\/index-[^/]*\.js$/.test(route.request().url())) await route.continue();
      else await route.abort();
    });
    await page.goto('/');
    await expect(page.getByTestId('loading')).toHaveText(
      'Mermaid could not be loaded. Check the connection and reload the page.',
    );
  });

  test('D29 the canvas is labelled and the steps are announced', async ({ page }) => {
    await openFocused(page);
    await expect(diagram(page)).toHaveAttribute('role', 'application');
    await expect(diagram(page)).toHaveAttribute(
      'aria-label',
      'Diagram. Arrow keys step through the flow, drag or scroll to move, plus and minus zoom.',
    );
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('live')).toHaveText(/^Step 1 of 42\. Shopper to Pages: /);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('live')).toHaveText('Overview. 42 steps.');
  });
});
