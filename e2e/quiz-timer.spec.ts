import { expect, test, type Page } from '@playwright/test';

import { open } from './helpers.ts';
import {
  EASY_CHOICE,
  EASY_CHOICE_COUNT,
  freezeClock,
  openQuiz,
  questionItems,
  startQuiz,
  submitButton,
  watchErrors,
  weakPointsDialog,
} from './support/quiz.ts';

// The Timer row of plan section 10: auto-submit at zero, correct stopwatch time, no double submit.
// The page's clock is Playwright's, so a minute passes at once. The built-in sample needs no model.

let errors: string[] = [];

test.beforeEach(({ page }) => {
  errors = watchErrors(page);
});

test.afterEach(() => {
  expect(errors, 'console errors or uncaught exceptions').toEqual([]);
});

const MINUTE = 60_000;

/** The set-up screen with the clock stopped, so the quiz starts at a known instant. */
async function openFrozen(page: Page) {
  await page.clock.install();
  await open(page);
  const dialog = await openQuiz(page);
  await freezeClock(page);
  return dialog;
}

test.describe('Timer', () => {
  test('T1 a custom timer warns near the end and submits at zero', async ({ page }) => {
    const dialog = await openFrozen(page);
    await startQuiz(dialog, { ...EASY_CHOICE, time: 'Timer', minutes: 1 });
    const timer = dialog.getByRole('timer', { name: 'Time left' });
    await expect(timer).toContainText('1:00');
    await expect(dialog.getByRole('status')).toHaveText('');

    // The warning comes in the last fifth of a short timer.
    await page.clock.fastForward(47 * 1000);
    await expect(timer).toContainText('0:13');
    await expect(dialog.getByRole('status')).toHaveText('');
    await page.clock.fastForward(2 * 1000);
    await expect(timer).toContainText('0:11');
    await expect(dialog.getByRole('status')).toHaveText('Almost out of time. It submits at zero.');

    await page.clock.fastForward(11 * 1000);
    await expect(dialog.getByRole('heading', { name: /^Score: 0 of 5/ })).toBeVisible();
    await expect(dialog).toContainText(
      'Time: 1:00. The time ran out, so your answers were submitted.',
    );
    await expect(submitButton(dialog)).toHaveCount(0);
    await expect(questionItems(dialog)).toHaveCount(EASY_CHOICE_COUNT);
    await expect(dialog.getByText('Not answered')).toHaveCount(EASY_CHOICE_COUNT);
  });

  test('T1 the custom length must be whole minutes within the limits', async ({ page }) => {
    await open(page);
    const dialog = await openQuiz(page);
    await dialog.getByRole('radio', { name: 'Timer' }).check();
    await expect(dialog.getByRole('radio', { name: '5 minutes', exact: true })).toBeChecked();
    await dialog.getByRole('radio', { name: 'Custom' }).check();
    const minutes = dialog.getByRole('spinbutton', { name: 'Minutes' });
    await expect(minutes).toHaveValue('20');
    await minutes.fill('0');
    await expect(dialog.getByRole('alert')).toHaveText('Enter whole minutes from 1 to 180.');
    await expect(dialog.getByRole('button', { name: 'Start the quiz' })).toBeDisabled();
    await minutes.fill('181');
    await expect(dialog.getByRole('button', { name: 'Start the quiz' })).toBeDisabled();
    await minutes.fill('2.5');
    await expect(dialog.getByRole('button', { name: 'Start the quiz' })).toBeDisabled();
    await minutes.fill('3');
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Start the quiz' })).toBeEnabled();
    await startQuiz(dialog);
    await expect(dialog.getByRole('timer', { name: 'Time left' })).toContainText('3:00');
  });

  test('T2 the stopwatch counts up and stops on submit', async ({ page }) => {
    const dialog = await openFrozen(page);
    await startQuiz(dialog, EASY_CHOICE);
    const timer = dialog.getByRole('timer', { name: 'Time taken' });
    await expect(timer).toContainText('0:00');
    await page.clock.fastForward(MINUTE + 35 * 1000);
    await expect(timer).toContainText('1:35');
    await submitButton(dialog).click();
    await expect(dialog).toContainText('Time: 1:35.');
    await expect(dialog).not.toContainText('ran out');
    // Time keeps passing; the result does not.
    await page.clock.fastForward(MINUTE);
    await expect(dialog).toContainText('Time: 1:35.');
    await expect(dialog).not.toContainText('2:35');
  });

  test('T2 with time off, nothing is shown or timed', async ({ page }) => {
    await open(page);
    const dialog = await openQuiz(page);
    await startQuiz(dialog, { ...EASY_CHOICE, time: 'Off' });
    await expect(dialog.getByRole('timer')).toHaveCount(0);
    await submitButton(dialog).click();
    await expect(dialog).toContainText('Not timed.');
  });

  test('T3 two submits at once count as one', async ({ page }) => {
    await open(page);
    const dialog = await openQuiz(page);
    await startQuiz(dialog, EASY_CHOICE);
    // Two clicks in the same task, before React can take the button away.
    await submitButton(dialog).evaluate((button) => {
      const el = button as unknown as { click: () => void };
      el.click();
      el.click();
    });
    await expect(dialog.getByRole('heading', { name: /^Score: 0 of 5/ })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: /^Score/ })).toHaveCount(1);
    await expect(submitButton(dialog)).toHaveCount(0);
    // Each miss was saved once.
    await dialog.getByRole('button', { name: 'See all weak points' }).click();
    const weak = weakPointsDialog(page);
    await expect(weak.locator('ul > li')).toHaveCount(EASY_CHOICE_COUNT);
    await expect(weak.getByText(/^1 time, last on/)).toHaveCount(EASY_CHOICE_COUNT);
  });

  test('T3 the timer reaching zero after a submit changes nothing', async ({ page }) => {
    const dialog = await openFrozen(page);
    await startQuiz(dialog, { ...EASY_CHOICE, time: 'Timer', minutes: 1 });
    await page.clock.fastForward(30 * 1000);
    await submitButton(dialog).click();
    await expect(dialog).toContainText('Time: 0:30.');
    await page.clock.fastForward(MINUTE);
    await expect(dialog).toContainText('Time: 0:30.');
    await expect(dialog).not.toContainText('ran out');
    await expect(dialog.getByRole('heading', { name: /^Score/ })).toHaveCount(1);
  });
});
