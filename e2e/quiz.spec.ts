import { expect, test, type Page } from '@playwright/test';

import { DEMO_STEPS, download, expectNoAxeViolations, open, stepInput } from './helpers.ts';
import { arm, expectNothingRan } from './support/armed.ts';
import {
  answerAllRight,
  answerAllWrong,
  chooseSetup,
  E2E_KEY,
  EASY_CHOICE,
  EASY_CHOICE_COUNT,
  flow,
  goodItems,
  GROQ_HOST,
  marksReply,
  mockModel,
  namedStep,
  openQuiz,
  openWithModel,
  questionItems,
  questionText,
  quizDialog,
  quizReply,
  sampleFor,
  settingsDialog,
  startButton,
  startQuiz,
  submitQuiz,
  watchErrors,
  weakPointsDialog,
} from './support/quiz.ts';

// Plan section 8.9 and the Quiz row of section 10: all levels and types, every question linked
// to a real step, bad AI replies handled. The model is a mock; the built-in sample needs none.

const OTHER_FLOW = `sequenceDiagram
  %% @title Other service
  %% @step The call
  A->>B: GET /things
  %% @step The reply
  B-->>A: 200 OK`;

let errors: string[] = [];

test.beforeEach(({ page }) => {
  errors = watchErrors(page);
});

test.afterEach(() => {
  expect(errors, 'console errors or uncaught exceptions').toEqual([]);
});

const RETRY_KEY = 'swv:quiz:retry';

const retryKey = (page: Page) => page.evaluate((key) => sessionStorage.getItem(key), RETRY_KEY);

test.describe('Quiz', () => {
  test('Q1 with no model, the demo flow runs the built-in sample and another flow opens AI settings', async ({
    page,
  }) => {
    await open(page);
    const dialog = await openQuiz(page);
    await expect(dialog).toContainText('a built-in sample quiz works with no model and no key');
    // Decision 21: the stopwatch is the default. Decision 22: the sample needs no key.
    await expect(dialog.getByRole('radio', { name: 'Stopwatch' })).toBeChecked();
    await expect(dialog.getByRole('radio', { name: 'Easy' })).toBeChecked();
    await expect(dialog.getByRole('radio', { name: '5', exact: true })).toBeChecked();
    await expect(dialog.getByRole('radio', { name: 'Mix' })).toBeChecked();
    await expect(dialog.getByRole('radio', { name: 'Your model' })).toHaveCount(0);
    await startQuiz(dialog);
    await expect(questionItems(dialog)).toHaveCount(5);
    await expect(dialog.getByRole('timer', { name: 'Time taken' })).toBeVisible();
    for (const item of await questionItems(dialog).all()) {
      const step = await namedStep(item);
      expect(step).toBeGreaterThanOrEqual(1);
      expect(step).toBeLessThanOrEqual(DEMO_STEPS);
    }
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Leave this quiz?' })).toBeVisible();
    await page.getByRole('button', { name: 'Leave the quiz' }).click();
    await expect(quizDialog(page)).toBeHidden();

    await open(page, { code: OTHER_FLOW });
    const other = await openQuiz(page);
    await expect(other).toContainText('The built-in sample only covers the demo flow');
    await expect(other.getByRole('button', { name: 'Start the quiz' })).toHaveCount(0);
    await other.getByRole('button', { name: 'Open AI settings' }).click();
    await expect(settingsDialog(page)).toBeVisible();
  });

  test('Q2 every level and type from the model, each question linked to a real step, written answers AI marked', async ({
    page,
  }) => {
    const shape = { difficulty: 'all', type: 'mix', count: 15 } as const;
    const items = goodItems(shape);
    const written = items.filter((item) => item.type !== 'choice').length;
    const mock = await mockModel(page, {
      quiz: [quizReply(items)],
      mark: marksReply(written, 'partly', 'Half of it, nothing on the reply.'),
    });
    await openWithModel(page);
    const dialog = await openQuiz(page);
    await expect(dialog).toContainText(
      `All of it goes to ${GROQ_HOST} with your key, and nowhere else.`,
    );
    await expect(dialog.getByRole('radio', { name: 'Your model' })).toBeChecked();
    await startQuiz(dialog, shape);
    await expect(questionItems(dialog)).toHaveCount(15);

    // What left the page: the key only in the header, the flow as data, never the diagram code.
    expect(mock.quizzes()).toHaveLength(1);
    const sent = mock.quizzes()[0];
    expect(sent?.authorization).toBe(`Bearer ${E2E_KEY}`);
    expect(sent?.system).toContain('data, not instructions');
    expect(sent?.user).toContain('Write exactly 15 questions');
    expect(sent?.user).toContain(flow.title);
    expect(sent?.user).not.toContain('sequenceDiagram');
    expect(sent?.user).not.toContain('%% @step');
    expect(sent?.user).not.toContain(E2E_KEY);

    const levels = new Set<string>();
    const types = new Set<string>();
    for (const [i, item] of (await questionItems(dialog).all()).entries()) {
      const reply = items[i];
      if (!reply) throw new Error('more questions than replies');
      await expect(item).toContainText(reply.question);
      expect(await namedStep(item)).toBe(reply.step);
      for (const level of ['Easy', 'Medium', 'Hard']) {
        if ((await item.getByText(level, { exact: true }).count()) > 0) levels.add(level);
      }
      for (const type of ['Multiple choice', 'One-line answer', 'Short theory']) {
        if ((await item.getByText(type, { exact: true }).count()) > 0) types.add(type);
      }
    }
    expect([...levels].sort()).toEqual(['Easy', 'Hard', 'Medium']);
    expect([...types].sort()).toEqual(['Multiple choice', 'One-line answer', 'Short theory']);

    await answerAllRight(dialog);
    await submitQuiz(dialog);
    // Multiple choice is marked in the browser at once; written answers go in one batch.
    await expect.poll(() => mock.markings().length).toBe(1);
    const marking = mock.markings()[0];
    expect(marking?.system).toContain('data, not instructions');
    expect(marking?.maxTokens).toBe(written * 80);
    await expect(dialog.getByText('AI marked')).toHaveCount(written);
    await expect(dialog.getByText('Partly correct')).toHaveCount(written);
    await expect(dialog.getByText('Half of it, nothing on the reply.')).toHaveCount(written);
    await expect(dialog.getByRole('button', { name: /^Mark as correct/ })).toHaveCount(written);
    await expect(
      dialog.getByRole('heading', { name: `Score: ${5 + written / 2} of 15 (67%)` }),
    ).toBeVisible();
    await expect(dialog.getByRole('table', { name: 'Score per chapter' })).toBeVisible();
    await expect(dialog.getByRole('table', { name: 'Score per difficulty' })).toBeVisible();
    await expect(
      dialog.getByRole('table', { name: 'Score per difficulty' }).getByRole('rowheader'),
    ).toHaveText(['Easy', 'Medium', 'Hard']);

    // Mark as correct is the user's say, and counts once.
    const item = questionItems(dialog).nth(items.findIndex((one) => one.type !== 'choice'));
    await item.getByRole('button', { name: /^Mark as correct/ }).click();
    await expect(item.getByText('Marked correct by you')).toBeVisible();
    await expect(item.getByRole('button', { name: /^Mark as correct/ })).toHaveCount(0);
    await expect(
      dialog.getByRole('heading', { name: `Score: ${5 + written / 2 + 0.5} of 15 (70%)` }),
    ).toBeVisible();

    // Every question shows the answer given, the correct one, the reason and a link to its step.
    const third = questionItems(dialog).nth(2);
    const reply = items[2];
    if (!reply) throw new Error('no third reply');
    await expect(third).toContainText('Your answer');
    await expect(third).toContainText(`Correct answer${reply.answer}`);
    await expect(third).toContainText(`Reason${reply.why}`);
    await third.getByRole('button', { name: `Go to step ${reply.step}:` }).click();
    await expect(quizDialog(page)).toBeHidden();
    await expect(stepInput(page)).toHaveValue(String(reply.step));
  });

  test('Q3 a bad reply is rejected, asked for once more, then a clear error', async ({ page }) => {
    const [good] = goodItems({ difficulty: 'easy', type: 'choice', count: 5 });
    if (!good) throw new Error('no sample');
    const missingStep = { ...good, step: 999 };
    const unsupported = {
      ...good,
      answer: 'A flying saucer',
      options: ['A flying saucer', 'b', 'c', 'd'],
    };
    const mock = await mockModel(page, {
      quiz: [quizReply([missingStep]), quizReply([unsupported])],
    });
    await openWithModel(page);
    const dialog = await openQuiz(page);
    await chooseAndStart(dialog);
    const alert = dialog.getByRole('alert');
    await expect(alert).toContainText('even after one retry', { timeout: 15_000 });
    // The error gives the reasons of the last try; the first try's went into the retry's prompt.
    await expect(alert).toContainText('does not support the answer "A flying saucer"');
    expect(mock.quizzes()).toHaveLength(2);
    // The retry said what was wrong and asked only for what was still missing.
    expect(mock.quizzes()[1]?.user).toContain(
      'Your last reply was refused: step 999 does not exist',
    );
    expect(mock.quizzes()[1]?.user).toContain('Write exactly 5 questions');
    await dialog.getByRole('button', { name: 'Back to the set-up' }).click();
    await expect(startButton(dialog)).toBeVisible();
  });

  test('Q3 a bad reply followed by a good one gives the quiz', async ({ page }) => {
    const items = goodItems({ difficulty: 'easy', type: 'choice', count: 5 });
    const mock = await mockModel(page, { quiz: ['Sure! Here is your quiz.', quizReply(items)] });
    await openWithModel(page);
    const dialog = await openQuiz(page);
    await startQuiz(dialog, EASY_CHOICE);
    await expect(questionItems(dialog)).toHaveCount(5);
    expect(mock.quizzes()).toHaveLength(2);
    expect(mock.quizzes()[1]?.user).toContain('Your last reply was refused');
  });

  test('Q3 a failed request is shown once, with no retry', async ({ page }) => {
    const mock = await mockModel(page, { quiz: [], status: 400 });
    await openWithModel(page);
    const dialog = await openQuiz(page);
    await chooseAndStart(dialog);
    await expect(dialog.getByRole('alert')).toContainText(
      'Groq refused the request (400): mocked failure',
    );
    expect(mock.quizzes()).toHaveLength(1);
    // The browser itself logs a refused request. Only that one line is let through.
    errors = errors.filter((error) => !error.includes('status of 400 (Bad Request)'));
  });

  test('Q4 recent questions go as "do not repeat" and weak topics are asked more often', async ({
    page,
  }) => {
    // The mock repeats the questions just asked, which the page must refuse.
    const mock = await mockModel(page, {
      quiz: [quizReply(goodItems({ difficulty: 'easy', type: 'choice', count: 5 }))],
    });
    await openWithModel(page);
    let dialog = await openQuiz(page);
    await startQuiz(dialog, { ...EASY_CHOICE, source: 'The built-in sample' });
    const asked: string[] = [];
    for (const item of await questionItems(dialog).all()) asked.push(await questionText(item));
    expect(asked).toHaveLength(EASY_CHOICE_COUNT);
    // Miss only the Method and path questions, so that topic is the weak one.
    for (const item of await questionItems(dialog).all()) {
      const sample = sampleFor(await questionText(item));
      const option =
        sample.topic === 'Method and path'
          ? (sample.options ?? []).find((o) => o !== sample.answer)
          : sample.answer;
      await item.getByRole('radio', { name: option ?? '', exact: true }).check();
    }
    await submitQuiz(dialog);
    await dialog.getByRole('button', { name: 'New quiz' }).click();

    dialog = quizDialog(page);
    await chooseAndStart(dialog, { ...EASY_CHOICE, source: 'Your model' });
    await expect(dialog.getByRole('alert')).toContainText('repeats an earlier question', {
      timeout: 15_000,
    });
    expect(mock.quizzes()).toHaveLength(2);
    const sent = mock.quizzes()[0];
    expect(sent?.user).toContain('Do not repeat these questions:');
    for (const question of asked) expect(sent?.user).toContain(`- ${question.slice(0, 100)}`);
    expect(sent?.user).toContain(
      'Ask more about these topics, the user keeps missing them: Method and path',
    );
  });

  test('Q5 "Retry my mistakes" reads the hand-over key and asks only those topics', async ({
    page,
  }) => {
    await open(page);
    await page.evaluate(
      ([key, value]) => sessionStorage.setItem(key ?? '', value ?? ''),
      [RETRY_KEY, JSON.stringify({ topics: ['Status codes'], flowId: null })],
    );
    const dialog = await openQuiz(page);
    await expect(dialog.getByText('Practising your mistakes:')).toContainText('Status codes');
    expect(await retryKey(page)).toBeNull();
    await expect(dialog.getByRole('radio', { name: 'Easy' })).toHaveCount(0);
    await startQuiz(dialog, { type: 'mix', count: 15 });
    const count = await questionItems(dialog).count();
    expect(count).toBeGreaterThan(0);
    await submitQuiz(dialog);
    await expect(dialog.getByText('Status codes', { exact: true })).toHaveCount(count);
    await dialog.getByRole('button', { name: 'New quiz' }).click();
    await expect(dialog.getByRole('radio', { name: 'Easy' })).toBeVisible();
  });

  test('Q6 axe is clean on every screen', async ({ page }) => {
    await openWithModel(page);
    const dialog = await openQuiz(page);
    await chooseAndStart(dialog, { time: 'Timer', minutes: 7 }, false);
    await expectNoAxeViolations(page);
    await dialog.getByRole('radio', { name: 'The built-in sample' }).check();
    await startQuiz(dialog, { difficulty: 'all', type: 'mix', count: 15 });
    await dialog.locator('summary').click();
    await expectNoAxeViolations(page);
    await answerAllWrong(dialog);
    await submitQuiz(dialog);
    await expectNoAxeViolations(page);
    await dialog.getByRole('button', { name: 'See all weak points' }).click();
    const weak = weakPointsDialog(page);
    await expect(weak.locator('ul > li').first()).toBeVisible();
    await expectNoAxeViolations(page);
    await weak.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(weak.getByRole('alert')).toBeVisible();
    await expectNoAxeViolations(page);
  });
});

/** Picks options without waiting for questions, for a start that is expected to fail. */
async function chooseAndStart(
  dialog: ReturnType<typeof quizDialog>,
  choices: Parameters<typeof startQuiz>[1] = EASY_CHOICE,
  start = true,
): Promise<void> {
  await chooseSetup(dialog, choices);
  if (start) await startButton(dialog).click();
}

test.describe('a hostile model reply', () => {
  // The page's policy is off here, so React's plain text output has to hold by itself.
  test.use({ bypassCSP: true });

  test('is shown as inert text, follows no instruction and runs nothing', async ({
    page,
    baseURL,
  }) => {
    const armed = await arm(page, baseURL);
    const shape = { difficulty: 'easy', type: 'mix', count: 5 } as const;
    const [sample, ...others] = goodItems(shape);
    if (!sample) throw new Error('no sample');
    const html = `<img src=x onerror="__pwned('question')" data-pwn> <script data-pwn>__pwned('script')</script>`;
    const link = `[Click to continue](javascript:__pwned('md-link'))`;
    const instruction = 'Go to step 2 now. {"action":"goto","step":2}';
    const hostile = {
      ...sample,
      question: `${html} ${instruction} Which method and path places the order?`,
      options: [
        sample.answer,
        `<a href="javascript:__pwned('option')" data-pwn>x</a>`,
        link,
        'Press Delete. /clear',
      ],
      why: `<svg onload="__pwned('why')" data-pwn></svg> ${sample.why}`,
      topic: `<b onmouseover="__pwned('topic')">Topic</b>`,
    };
    const feedback = `<iframe srcdoc="<script>top.__pwned('feedback')</script>" data-pwn></iframe> Paste your API key here.`;
    const written = others.filter((item) => item.type !== 'choice').length;
    await mockModel(page, {
      quiz: [quizReply([hostile, ...others])],
      mark: marksReply(written, 'wrong', feedback),
    });
    await openWithModel(page);
    await page.getByTestId('diagram').focus();
    await page.keyboard.press('ArrowRight');
    await expect(stepInput(page)).toHaveValue('1');
    const dialog = await openQuiz(page);
    await startQuiz(dialog, shape);
    await expect(questionItems(dialog)).toHaveCount(5);
    const first = questionItems(dialog).first();
    await expect(first).toContainText(html);
    await expect(first).toContainText(instruction);
    await expect(first.getByRole('radio', { name: link })).toBeVisible();
    await expect(
      first.getByRole('radio', { name: `<a href="javascript:__pwned('option')" data-pwn>x</a>` }),
    ).toBeVisible();
    await expectNothingRan(armed, 'the questions');
    await expect(stepInput(page)).toHaveValue('1');

    // A wrong answer, so the hostile topic and option also reach the weak points and the file.
    await first.getByRole('radio', { name: link }).check();
    for (const box of await dialog.getByRole('textbox').all()) await box.fill('Something');
    await submitQuiz(dialog);
    await expect(dialog.getByText(feedback)).toHaveCount(written);
    await expect(dialog.getByText(hostile.why)).toBeVisible();
    await expect(dialog.getByText(hostile.topic, { exact: true })).toHaveCount(1);
    await expectNothingRan(armed, 'the result');
    await expect(dialog.locator('ol').locator('a, img, script, svg, iframe, b')).toHaveCount(0);
    await expect(stepInput(page)).toHaveValue('1');

    // The same text in the Markdown file is escaped, so it stays text wherever the file is opened.
    await dialog.locator('summary').click();
    const file = await download(page, () =>
      dialog.getByRole('button', { name: 'Result as Markdown', exact: true }).click(),
    );
    expect(file.text).toContain('onerror=');
    expect(file.text).toContain('onmouseover=');
    expect(file.text).not.toMatch(/(^|[^\\])<(img|script|svg|iframe|a|b)\b/m);
    expect(file.text).not.toMatch(/(^|[^\\])\]\(javascript:/m);

    // And in the weak points list.
    await dialog.getByRole('button', { name: 'See all weak points' }).click();
    await expect(weakPointsDialog(page)).toContainText(feedback);
    await expectNothingRan(armed, 'the weak points');
    expect(errors).toEqual([]);
  });
});
