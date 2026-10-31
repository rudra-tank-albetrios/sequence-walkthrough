import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { firstTimeVisitor, TOUR_SEEN } from './visitors.ts';

const A11Y_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Every stop, in the order the plan lists the features. */
const STOPS = [
  'layers',
  'voice',
  'flow-rail',
  'side-parts',
  'ask-ai',
  'usage',
  'quiz',
  'recap',
  'review',
  'exports',
];
/** Stops whose element a later phase brings: until then the card is centred, with no spotlight. */
const WAITING = ['voice', 'flow-rail', 'usage', 'quiz', 'recap', 'review'];

const card = (page: Page) => page.getByTestId('tour-card');

async function diagramDrawn(page: Page) {
  await expect(page.getByTestId('diagram').locator('svg').first()).toBeVisible({ timeout: 30_000 });
}

const storedSeen = (page: Page) =>
  page.evaluate((name) => localStorage.getItem(name), TOUR_SEEN.name);

/** The tour decides as the first flow loads, so a settled page that shows no card has none coming. */
async function expectNoTour(page: Page) {
  await diagramDrawn(page);
  await page.waitForTimeout(500);
  await expect(card(page)).toHaveCount(0);
}

async function startTour(page: Page) {
  const button = page.getByRole('button', { name: 'Take the tour' });
  if (await button.isVisible()) {
    await button.click();
  } else {
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('menuitem', { name: 'Take the tour' }).click();
  }
  await expect(card(page)).toHaveAttribute('data-stop', 'layers');
}

async function nextStop(page: Page, id: string) {
  await card(page).getByRole('button', { name: 'Next' }).click();
  await expect(card(page)).toHaveAttribute('data-stop', id);
}

test.describe('a first-time visitor', () => {
  test.use({ storageState: firstTimeVisitor });

  test('gets the tour once by itself, and comes back as a returning visitor without it', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(card(page)).toHaveAttribute('data-stop', 'layers', { timeout: 30_000 });
    await expect(page.getByRole('dialog', { name: /One request, every layer/ })).toBeVisible();
    await diagramDrawn(page);

    // Every other test starts with this same value, so this keeps them honest returning visitors.
    expect(await storedSeen(page)).toBe(TOUR_SEEN.value);

    await card(page).getByRole('button', { name: 'Skip tour' }).click();
    await expect(card(page)).toHaveCount(0);

    await page.reload();
    await expectNoTour(page);
    expect(await storedSeen(page)).toBe(TOUR_SEEN.value);
  });

  test('a reload half way through the tour does not start it again', async ({ page }) => {
    await page.goto('/');
    await expect(card(page)).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await expectNoTour(page);
  });

  test('a shared link goes straight to what it shares, and the next plain visit gets the tour', async ({
    page,
  }) => {
    await page.goto('/#step=3');
    await expectNoTour(page);
    expect(await storedSeen(page)).toBeNull();

    await page.goto('about:blank');
    await page.goto('/');
    await expect(card(page)).toBeVisible({ timeout: 30_000 });
  });

  test("a person's own saved code stays in front", async ({ page }) => {
    await page.addInitScript(() => {
      const code = 'sequenceDiagram\n  %% @title My own flow\n  A->>B: hello';
      localStorage.setItem('swv:code', JSON.stringify(code));
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('My own flow');
    await expectNoTour(page);
  });
});

test.describe('a returning visitor', () => {
  test('sees no tour, and the button starts it', async ({ page }) => {
    await page.goto('/');
    await expectNoTour(page);
    await startTour(page);
  });

  test('walks every stop in order, with the spotlight on each element that exists', async ({
    page,
  }) => {
    await page.goto('/');
    await diagramDrawn(page);
    await startTour(page);

    for (const [index, id] of STOPS.entries()) {
      if (index > 0) await nextStop(page, id);
      await expect(card(page)).toContainText(`Stop ${index + 1} of ${STOPS.length}`);
      const box = await card(page).boundingBox();
      const view = page.viewportSize();
      const inView =
        box !== null &&
        view !== null &&
        box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= view.width &&
        box.y + box.height <= view.height;
      expect(inView, `${id} card stays on screen`).toBe(true);

      const spot = page.getByTestId('tour-spotlight');
      if (WAITING.includes(id)) {
        await expect(spot).toHaveCount(0);
      } else {
        const target = page.locator(`[data-tour="${id}"]:visible`).first();
        const [spotBox, targetBox] = await Promise.all([spot.boundingBox(), target.boundingBox()]);
        expect(spotBox, `${id} has a spotlight`).not.toBeNull();
        expect(targetBox, `${id} has a target`).not.toBeNull();
        expect(Math.abs((spotBox?.x ?? 0) - (targetBox?.x ?? 0))).toBeLessThanOrEqual(5);
        expect(Math.abs((spotBox?.y ?? 0) - (targetBox?.y ?? 0))).toBeLessThanOrEqual(5);
      }
    }

    await card(page).getByRole('button', { name: 'Back' }).click();
    await expect(card(page)).toHaveAttribute('data-stop', STOPS.at(-2) ?? '');
    await nextStop(page, STOPS.at(-1) ?? '');
    await expect(card(page).getByRole('button', { name: 'Next' })).toHaveCount(0);
    await card(page).getByRole('button', { name: 'Finish' }).click();
    await expect(card(page)).toHaveCount(0);
    await expect(page.getByTestId('tour-backdrop')).toHaveCount(0);
  });

  test('works by keyboard: arrows move, focus stays in the card, Esc skips and focus returns', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'A phone has no keyboard, and the button lives in the More menu');
    await page.goto('/');
    await diagramDrawn(page);
    const button = page.getByRole('button', { name: 'Take the tour' });
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(card(page)).toHaveAttribute('data-stop', 'layers');
    await expect(card(page).getByRole('button', { name: 'Next' })).toBeFocused();

    await page.keyboard.press('ArrowRight');
    await expect(card(page)).toHaveAttribute('data-stop', 'voice');
    await expect(card(page).getByRole('button', { name: 'Next' })).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(card(page)).toHaveAttribute('data-stop', 'layers');

    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Tab');
      await expect(card(page).locator(':focus'), 'focus stays in the card').toHaveCount(1);
    }

    // The page's own shortcuts stay quiet while the tour is open.
    await page.keyboard.press('t');
    await expect(page.getByTestId('diagram')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(card(page)).toHaveCount(0);
    await expect(button).toBeFocused();

    // The walkthrough's keys work again.
    await page.keyboard.press('ArrowRight');
    await expect(page.getByLabel('Step number, type to jump')).toHaveValue('1');
  });

  test('opens a feature for its stop, keeps the card on top, and closes it when moving on', async ({
    page,
  }) => {
    await page.goto('/');
    await diagramDrawn(page);
    await startTour(page);
    for (const id of STOPS.slice(1, STOPS.indexOf('ask-ai') + 1)) await nextStop(page, id);

    const ask = page.getByTestId('ask-chips');
    await expect(ask).toBeAttached();
    await expect(card(page).getByRole('button', { name: 'Next' })).toBeFocused();

    await nextStop(page, 'usage');
    await expect(ask).toHaveCount(0);
    await expect(card(page).getByRole('button', { name: 'Next' })).toBeFocused();
  });

  test('needs no key and never calls a model, and its usage data is in the tour only', async ({
    page,
    baseURL,
  }) => {
    const outside: string[] = [];
    const errors: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (!url.startsWith(baseURL ?? '') && !/^(data|blob):/.test(url)) outside.push(url);
    });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await page.goto('/');
    await diagramDrawn(page);
    const keysBefore = await page.evaluate(() => Object.keys(localStorage).sort());
    expect(keysBefore.join()).not.toContain('swv:ai');
    await expect(page.getByText('Simulated numbers')).toHaveCount(0);

    await startTour(page);
    for (const id of STOPS.slice(1)) {
      await nextStop(page, id);
      const demo = page.getByTestId('tour-demo-usage');
      if (id === 'usage') {
        await expect(demo).toContainText('Demo');
        await expect(demo.getByRole('meter')).toHaveCount(2);
        await expect(demo).toContainText('switched to Gemini');
      } else {
        await expect(demo).toHaveCount(0);
      }
    }
    await card(page).getByRole('button', { name: 'Finish' }).click();
    await expect(card(page)).toHaveCount(0);

    await expect(page.getByText('Simulated numbers')).toHaveCount(0);
    expect(await page.evaluate(() => Object.keys(localStorage).sort())).toEqual(keysBefore);
    expect(outside).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('uses no motion when the visitor prefers none', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await diagramDrawn(page);
    await startTour(page);
    await expect(card(page)).toHaveCSS('animation-name', 'none');

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await nextStop(page, 'voice');
    await expect(card(page)).not.toHaveCSS('animation-name', 'none');
  });

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`has no accessibility violations at any stop in ${colorScheme}, or after the tour`, async ({
      page,
    }) => {
      // Motion off, so axe reads the colours a stop settles on and not a fade half way through.
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.goto('/');
      await diagramDrawn(page);
      await startTour(page);
      for (const [index, id] of STOPS.entries()) {
        if (index > 0) await nextStop(page, id);
        // A modal hides the page from screen readers and traps the focus. Axe still counts the
        // buttons behind it as hidden but focusable, so this one rule stays off; the keyboard test
        // above proves that Tab cannot reach them.
        const results = await new AxeBuilder({ page })
          .withTags(A11Y_TAGS)
          .disableRules(['aria-hidden-focus'])
          .analyze();
        expect(results.violations, `stop ${id}`).toEqual([]);
      }

      await card(page).getByRole('button', { name: 'Finish' }).click();
      await expect(card(page)).toHaveCount(0);
      const after = await new AxeBuilder({ page }).withTags(A11Y_TAGS).analyze();
      expect(after.violations, 'the page after the tour').toEqual([]);
    });
  }

  test('puts everything back afterwards and never overwrites the saved code', async ({
    page,
    isMobile,
  }) => {
    const code = [
      'sequenceDiagram',
      '  %% @title My own flow',
      '  %% @step One.',
      '  A->>B: hello',
      '  %% @step Two.',
      '  B-->>A: 200 OK',
    ].join('\n');
    await page.addInitScript((saved) => {
      localStorage.setItem('swv:code', JSON.stringify(saved));
    }, code);
    const saved = () =>
      page.evaluate(() => JSON.parse(localStorage.getItem('swv:code') ?? '""') as string);

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('My own flow');
    await diagramDrawn(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByLabel('Step number, type to jump')).toHaveValue('2');
    if (!isMobile) await page.keyboard.press('i');
    const insight = page.getByRole('complementary', { name: /Insight/ });
    if (!isMobile) await expect(insight).toBeVisible();

    await startTour(page);
    // The page behind the card is hidden from the accessibility tree, so this looks for the tag.
    await expect(page.locator('h1')).toHaveText('Place an order');
    await page.waitForTimeout(700);
    expect(await saved()).toBe(code);

    await nextStop(page, 'voice');
    await card(page).getByRole('button', { name: 'Skip tour' }).click();
    await expect(card(page)).toHaveCount(0);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('My own flow');
    await expect(page.getByLabel('Step number, type to jump')).toHaveValue('2');
    if (!isMobile) await expect(insight).toBeVisible();
    await page.waitForTimeout(700);
    expect(await saved()).toBe(code);
  });
});
