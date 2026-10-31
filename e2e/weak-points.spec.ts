import { expect, test, type Locator, type Page } from '@playwright/test';

import { mdText } from '../apps/web/src/shared/lib/markdown.ts';
import { DEMO_TITLE, download, open, toastBox } from './helpers.ts';
import {
  answerAllRight,
  answerAllWrong,
  EASY_CHOICE,
  EASY_CHOICE_COUNT,
  openQuiz,
  questionItems,
  questionText,
  quizDialog,
  sampleFor,
  startQuiz,
  submitQuiz,
  watchErrors,
  weakPointsDialog,
} from './support/quiz.ts';

// The Weak points part of the "Weak points and recap" row of plan section 10: saved after reload,
// reduced by correct answers, viewable, exportable and clearable, with the browser-data notice.
// The built-in sample needs no model.

const NOTICE =
  'Weak points are kept only in this browser. Clearing your browser data removes them too. A correct answer later lowers the count, and at zero the point goes away.';

let errors: string[] = [];

test.beforeEach(({ page }) => {
  errors = watchErrors(page);
});

test.afterEach(() => {
  expect(errors, 'console errors or uncaught exceptions').toEqual([]);
});

/** Runs the five easy multiple choice questions and misses them all. Returns their texts. */
async function missEverything(page: Page): Promise<string[]> {
  const dialog = await openQuiz(page);
  await startQuiz(dialog, EASY_CHOICE);
  const asked: string[] = [];
  for (const item of await questionItems(dialog).all()) asked.push(await questionText(item));
  await answerAllWrong(dialog);
  await submitQuiz(dialog);
  return asked;
}

const openWeakPoints = async (page: Page): Promise<Locator> => {
  await quizDialog(page).getByRole('button', { name: /weak points/i }).click();
  const weak = weakPointsDialog(page);
  await expect(weak).toBeVisible();
  await expect(weak.getByRole('status')).toHaveCount(0);
  return weak;
};

const items = (weak: Locator) => weak.locator('ul > li');

test.describe('Weak points', () => {
  test('WP1 a miss is saved with its step, chapter and reason, and is still there after a reload', async ({
    page,
  }) => {
    await open(page);
    const asked = await missEverything(page);
    const dialog = quizDialog(page);
    const found = dialog.getByRole('region', { name: 'Weak points found' });
    await expect(found).toBeVisible();
    // The five easy choice questions cover four topics; every miss is counted.
    const chips = await found.locator('li').allTextContents();
    expect(chips.map((chip) => Number(chip.split(': ')[1])).reduce((a, b) => a + b, 0)).toBe(EASY_CHOICE_COUNT);

    let weak = await openWeakPoints(page);
    await expect(weak).toContainText(NOTICE);
    await expect(items(weak)).toHaveCount(EASY_CHOICE_COUNT);
    const first = items(weak).first();
    const sample = sampleFor((await first.locator('p').first().textContent()) ?? '');
    await expect(first).toContainText(`Where${DEMO_TITLE}, step `);
    await expect(first).toContainText(`Topic${sample.topic}`);
    await expect(first).toContainText(`Correct answer${sample.answer}`);
    await expect(first).toContainText(`Why it was wrong${sample.why}`);
    await expect(first).toContainText('Your answer');
    await expect(first).toContainText(/Missed1 time, last on \d{4}-\d{2}-\d{2}/);
    for (const question of asked) await expect(weak).toContainText(question);

    await page.reload();
    await expect(page.getByTestId('diagram').locator('svg').first()).toBeVisible({ timeout: 30_000 });
    await openQuiz(page);
    weak = await openWeakPoints(page);
    await expect(items(weak)).toHaveCount(EASY_CHOICE_COUNT);
    for (const question of asked) await expect(weak).toContainText(question);
  });

  test('WP2 a later correct answer lowers the count, and at zero the point goes away', async ({ page }) => {
    await open(page);
    await missEverything(page);
    const dialog = quizDialog(page);
    await dialog.getByRole('button', { name: 'New quiz' }).click();
    await startQuiz(dialog, EASY_CHOICE);
    await answerAllWrong(dialog);
    await submitQuiz(dialog);
    let weak = await openWeakPoints(page);
    await expect(items(weak)).toHaveCount(EASY_CHOICE_COUNT);
    await expect(weak.getByText(/^2 times, last on/)).toHaveCount(EASY_CHOICE_COUNT);
    await page.keyboard.press('Escape');
    await expect(weak).toBeHidden();

    await dialog.getByRole('button', { name: 'New quiz' }).click();
    await startQuiz(dialog, EASY_CHOICE);
    await answerAllRight(dialog);
    await submitQuiz(dialog);
    await expect(dialog.getByRole('heading', { name: /^Score: 5 of 5 \(100%\)/ })).toBeVisible();
    await expect(dialog.getByRole('region', { name: 'Weak points found' })).toContainText('None so far.');
    weak = await openWeakPoints(page);
    await expect(items(weak)).toHaveCount(EASY_CHOICE_COUNT);
    await expect(weak.getByText(/^1 time, last on/)).toHaveCount(EASY_CHOICE_COUNT);
    await page.keyboard.press('Escape');

    await dialog.getByRole('button', { name: 'New quiz' }).click();
    await startQuiz(dialog, EASY_CHOICE);
    await answerAllRight(dialog);
    await submitQuiz(dialog);
    weak = await openWeakPoints(page);
    await expect(items(weak)).toHaveCount(0);
    await expect(weak).toContainText('Nothing here yet. Mistakes in a quiz show up in this list.');
  });

  test('WP3 the list can be exported as Markdown and cleared, after a confirmation', async ({ page }) => {
    await open(page);
    const asked = await missEverything(page);
    const weak = await openWeakPoints(page);
    await expect(weak.getByRole('radio', { name: 'This flow' })).toBeChecked();

    const file = await download(page, () => weak.getByRole('button', { name: 'Export as Markdown' }).click());
    expect(file.name).toBe(`${DEMO_TITLE} - weak points.md`);
    expect(file.text.startsWith('# Weak points\n')).toBe(true);
    for (const question of asked) expect(file.text).toContain(`## ${mdText(question)}`);
    expect(file.text).toContain(`- **Flow:** ${DEMO_TITLE}`);
    expect(file.text).toContain('- **Times missed:** 1');
    expect(file.text).not.toMatch(/(^|[^\\])</m);
    await expect(toastBox(page)).toContainText(`Downloaded ${DEMO_TITLE} - weak points.md`);

    await weak.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(weak.getByRole('alert')).toContainText(`Clear ${EASY_CHOICE_COUNT} weak points? This cannot be undone.`);
    await weak.getByRole('button', { name: 'Keep them' }).click();
    await expect(items(weak)).toHaveCount(EASY_CHOICE_COUNT);
    await weak.getByRole('button', { name: 'Clear', exact: true }).click();
    await weak.getByRole('button', { name: 'Clear for good' }).click();
    await expect(items(weak)).toHaveCount(0);
    await expect(weak).toContainText('Nothing here yet.');
    await expect(toastBox(page)).toContainText('Weak points cleared');

    await page.reload();
    await expect(page.getByTestId('diagram').locator('svg').first()).toBeVisible({ timeout: 30_000 });
    await openQuiz(page);
    await expect(items(await openWeakPoints(page))).toHaveCount(0);
  });

  test('WP4 the list is per flow, with all flows on request', async ({ page }) => {
    await open(page);
    await missEverything(page);
    await open(page, {
      code: 'sequenceDiagram\n  %% @title Another\n  %% @step One\n  A->>B: GET /x\n  %% @step Two\n  B-->>A: 200 OK',
    });
    await openQuiz(page);
    const weak = await openWeakPoints(page);
    await expect(items(weak)).toHaveCount(0);
    await weak.getByRole('radio', { name: 'All flows' }).check();
    await expect(items(weak)).toHaveCount(EASY_CHOICE_COUNT);
    await expect(items(weak).first()).toContainText(`Where${DEMO_TITLE}, step `);
  });
});
