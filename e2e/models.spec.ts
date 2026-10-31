import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  expectAccessibleDialog,
  GEMINI_URL,
  GROQ_URL,
  HOSTS,
  keyLog,
  mockProvider,
  MISTRAL_URL,
  modelStorage,
  openAskOnStep1,
  openDemo,
  openSettings,
  seedStorage,
  type SeedModel,
} from './ai-helpers.ts';

const row = (settings: Locator, name: string) =>
  settings.getByTestId('model-row').filter({ hasText: name });
const answerOf = (dialog: Locator) => dialog.getByTestId('ask-answer');
const diagramReady = (page: Page) =>
  expect(page.getByTestId('diagram').locator('svg').first()).toBeVisible({ timeout: 30_000 });

/** How version 2 named a saved answer. Written out here, so a change to the app's copy cannot hide. */
function v2Hash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** Returning with these models, on the Ask panel of step 1. */
async function askWith(
  page: Page,
  models: readonly SeedModel[],
  extra: Record<string, unknown> = {},
) {
  await seedStorage(page, modelStorage(models, extra));
  await openDemo(page);
  return openAskOnStep1(page);
}

async function addModel(settings: Locator, provider: string, key: string) {
  const add = settings.getByRole('button', { name: 'Add a model' });
  if (await add.isVisible()) await add.click();
  await settings.getByLabel('Provider').selectOption(provider);
  await settings.getByLabel('API key').fill(key);
  await settings.getByRole('button', { name: 'Save' }).click();
}

test.describe('The model list', () => {
  test('adds, tests, edits, reorders and deletes, with each key only at its own URL', async ({
    page,
  }) => {
    const groq = await mockProvider(page, GROQ_URL, { answer: 'OK' });
    const gemini = await mockProvider(page, GEMINI_URL, { answer: 'OK' });
    const mistral = await mockProvider(page, MISTRAL_URL, { answer: 'OK' });
    const log = keyLog(page);
    await openDemo(page);
    const settings = await openSettings(page);

    await addModel(settings, 'groq', 'groq-secret');
    await addModel(settings, 'gemini', 'gemini-secret');
    await addModel(settings, 'mistral', 'mistral-secret');
    await expect(settings.getByTestId('model-row')).toHaveCount(3);

    await settings.getByRole('button', { name: 'Test Groq' }).click();
    await expect(row(settings, 'Groq').getByRole('status')).toContainText('Works. Groq said: OK.');
    await settings.getByRole('button', { name: 'Test Gemini' }).click();
    await expect(row(settings, 'Gemini').getByRole('status')).toContainText(
      'Works. Gemini said: OK.',
    );
    await settings.getByRole('button', { name: 'Test Mistral' }).click();
    await expect(row(settings, 'Mistral').getByRole('status')).toContainText(
      'Works. Mistral said: OK.',
    );
    expect([groq.length, gemini.length, mistral.length]).toEqual([1, 1, 1]);

    await settings.getByRole('button', { name: 'Edit Gemini' }).click();
    const edit = settings.getByRole('form', { name: 'Edit Gemini' });
    await edit.getByLabel('Name').fill('Google');
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(row(settings, 'Google')).toBeVisible();

    await settings.getByRole('button', { name: 'Move Mistral up' }).click();
    await expect(settings.getByTestId('model-row').nth(1)).toContainText('Mistral');
    await expect(settings.getByTestId('model-row').nth(2)).toContainText('Google');

    await settings.getByRole('button', { name: 'Delete Mistral' }).click();
    await settings.getByRole('button', { name: 'Confirm deleting Mistral' }).click();
    await expect(settings.getByTestId('model-row')).toHaveCount(2);
    const stored = await page.evaluate(() => localStorage.getItem('swv:ai:models') ?? '');
    expect(stored).not.toContain('mistral-secret');
    expect(stored).toContain('groq-secret');

    await settings.getByRole('button', { name: 'Test Google' }).click();
    await expect(row(settings, 'Google').getByRole('status')).toContainText(
      'Works. Google said: OK.',
    );

    expect([...log].sort()).toEqual([
      `gemini-secret at ${GEMINI_URL}`,
      `groq-secret at ${GROQ_URL}`,
      `mistral-secret at ${MISTRAL_URL}`,
    ]);
  });

  test('explains a call the browser blocked, and tells it apart from a host that is down', async ({
    page,
  }) => {
    await page.route(GROQ_URL, async (route) => {
      if (route.request().method() === 'POST') await route.abort('failed');
      else await route.fulfill({ status: 200, body: '' });
    });
    await page.route(GEMINI_URL, (route) => route.abort('failed'));
    await seedStorage(page, modelStorage([{ preset: 'groq' }, { preset: 'gemini' }]));
    await openDemo(page);
    const settings = await openSettings(page);

    await settings.getByRole('button', { name: 'Test Groq' }).click();
    await expect(row(settings, 'Groq').getByRole('status')).toContainText(
      'Your browser blocked the reply from api.groq.com.',
    );
    await settings.getByRole('button', { name: 'Test Gemini' }).click();
    await expect(row(settings, 'Gemini').getByRole('status')).toContainText(
      'Nothing answered at generativelanguage.googleapis.com.',
    );
  });

  test('a reply without a CORS header reads as blocked', async ({ page }) => {
    await page.route(GROQ_URL, async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choices: [{ message: { content: 'OK' } }] }),
      });
    });
    await seedStorage(page, modelStorage([{ preset: 'groq' }]));
    await openDemo(page);
    const settings = await openSettings(page);
    await settings.getByRole('button', { name: 'Test Groq' }).click();
    await expect(row(settings, 'Groq').getByRole('status')).toContainText(
      'Your browser blocked the reply from api.groq.com.',
    );
  });

  test('keys version 2 saved load and answer, with nothing marked as a fallback', async ({
    page,
  }) => {
    const groq = await mockProvider(page, GROQ_URL, { answer: 'Still works.' });
    const gemini = await mockProvider(page, GEMINI_URL, { status: 429, body: '{}' });
    await seedStorage(page, {
      'swv:ai': {
        provider: 'gemini',
        keys: { gemini: 'old-gemini', groq: 'old-groq' },
        models: {},
        customUrl: '',
        includePayload: true,
        autoNote: false,
        mode: 'project',
      },
      'swv:ai:consent': HOSTS,
    });
    await openDemo(page);
    const dialog = await openAskOnStep1(page);
    await expect(dialog.getByRole('combobox', { name: 'Model to ask first' })).toHaveValue(/.+/);
    await dialog.getByRole('button', { name: 'Why this step?' }).click();
    await expect(answerOf(dialog)).toContainText('Every model has reached its limit');
    expect(gemini).toHaveLength(1);
    expect(gemini[0]?.authorization).toBe('Bearer old-gemini');
    expect(groq).toHaveLength(0);

    await dialog
      .getByRole('combobox', { name: 'Model to ask first' })
      .selectOption({ label: 'Groq' });
    await dialog.getByRole('button', { name: 'Why this step?' }).click();
    await expect(answerOf(dialog)).toContainText('Still works.');
    expect(groq[0]?.authorization).toBe('Bearer old-groq');

    const stored = await page.evaluate(
      () => JSON.parse(localStorage.getItem('swv:ai') ?? '{}') as unknown,
    );
    expect(stored).toEqual({ includePayload: true, autoNote: false, mode: 'project' });
  });

  test('Forget key when this tab closes keeps the key out of localStorage', async ({
    page,
    context,
  }) => {
    await mockProvider(page, GROQ_URL, { answer: 'OK' });
    await seedStorage(page, modelStorage([{ preset: 'groq' }]));
    await openDemo(page);
    const settings = await openSettings(page);
    await settings.getByRole('checkbox', { name: /Forget key when this tab closes/ }).check();
    expect(await page.evaluate(() => localStorage.getItem('swv:ai:models') ?? '')).not.toContain(
      'groq-key',
    );
    await expect(row(settings, 'Groq').getByText('Add the API key')).toBeHidden();

    await page.reload();
    await diagramReady(page);
    const dialog = await openAskOnStep1(page);
    await dialog.getByRole('button', { name: 'Why this step?' }).click();
    await expect(answerOf(dialog)).toContainText('OK');

    const other = await context.newPage();
    await openDemo(other);
    const later = await openAskOnStep1(other);
    await expect(later.getByText('Add the API key for Groq.')).toBeVisible();
    await other.close();
  });

  test('the privacy notice comes first, naming what goes where, and nothing is sent before it', async ({
    page,
  }) => {
    const groq = await mockProvider(page, GROQ_URL, { answer: 'Now it went out.' });
    await seedStorage(page, { ...modelStorage([{ preset: 'groq' }]), 'swv:ai:consent': [] });
    await openDemo(page);
    const dialog = await openAskOnStep1(page);
    await dialog.getByRole('button', { name: 'Why this step?' }).click();
    const notice = dialog.getByTestId('privacy-notice');
    await expect(notice).toContainText('Groq (api.groq.com)');
    await expect(notice).toContainText('your question');
    await expectAccessibleDialog(page);
    expect(groq).toHaveLength(0);
    await notice.getByRole('button', { name: 'I understand, continue' }).click();
    await expect(answerOf(dialog)).toContainText('Now it went out.');
    expect(groq).toHaveLength(1);
    await expect(notice).toBeHidden();
  });

  test('the settings pass the accessibility check', async ({ page }) => {
    await seedStorage(page, {
      ...modelStorage([
        { preset: 'groq' },
        { preset: 'gemini', fallback: true, limits: { requestsPerDay: 100 } },
      ]),
      'swv:ai:consent': [],
    });
    await openDemo(page);
    const settings = await openSettings(page);
    await expect(settings.getByTestId('privacy-notice')).toBeVisible();
    await expectAccessibleDialog(page);
    await settings.getByRole('button', { name: 'I understand, continue' }).click();
    await settings.getByRole('button', { name: 'Edit Groq' }).click();
    await expect(settings.getByRole('form', { name: 'Edit Groq' })).toBeVisible();
    await expectAccessibleDialog(page);
  });
});

test.describe('The usage bar', () => {
  const remaining = (left: number) => ({
    answer: 'OK',
    headers: {
      'x-ratelimit-limit-requests': '100',
      'x-ratelimit-remaining-requests': String(left),
      'x-ratelimit-reset-requests': '2m0s',
    },
  });

  test('shows Exact readings as text, in the colour for the amount used, with the limit on focus', async ({
    page,
  }) => {
    const replies = [remaining(50), remaining(30), remaining(10)];
    await mockProvider(page, GROQ_URL, () => replies.shift() ?? {});
    const dialog = await askWith(page, [{ preset: 'groq' }]);
    const bar = dialog.getByTestId('usage-bar');
    await expect(bar).toContainText('0 requests today');
    await expect(bar).toContainText('Count only');

    await dialog.getByRole('button', { name: 'Why this step?' }).click();
    await expect(bar).toContainText('50% used, 50 of 100 requests left');
    await expect(bar).toContainText('Exact');
    await expect(bar).toHaveAttribute('data-level', 'green');

    await dialog.getByRole('button', { name: 'Explain simpler' }).click();
    await expect(bar).toContainText('70% used, 30 of 100 requests left');
    await expect(bar).toHaveAttribute('data-level', 'amber');

    await dialog.getByRole('button', { name: 'What if it fails?' }).click();
    await expect(bar).toContainText('90% used, 10 of 100 requests left');
    await expect(bar).toHaveAttribute('data-level', 'red');

    await bar.focus();
    const tip = page.getByRole('tooltip');
    await expect(tip).toContainText('Limit 100 requests');
    await expect(tip).toContainText('Resets at');
    await expectAccessibleDialog(page);
  });

  test('labels an estimate from typed limits, and says it is this browser only', async ({
    page,
  }) => {
    await mockProvider(page, GROQ_URL, { answer: 'OK' });
    const dialog = await askWith(page, [{ preset: 'groq', limits: { requestsPerDay: 4 } }]);
    const bar = dialog.getByTestId('usage-bar');
    await dialog.getByRole('button', { name: 'Why this step?' }).click();
    await expect(bar).toContainText('25% used, 3 of 4 requests left');
    await expect(bar).toContainText('Estimated, this browser only');
    await expect(bar).toHaveAttribute('data-level', 'green');
  });

  test('without limits it counts, and draws no bar it cannot back up', async ({ page }) => {
    await mockProvider(page, GROQ_URL, { answer: 'OK' });
    const dialog = await askWith(page, [{ preset: 'groq' }]);
    const bar = dialog.getByTestId('usage-bar');
    await dialog.getByRole('button', { name: 'Why this step?' }).click();
    await expect(bar).toContainText('1 request today');
    await expect(bar).toContainText('Count only');
    await expect(bar.getByRole('meter')).toHaveCount(0);
  });

  test('is also shown for each model in the settings', async ({ page }) => {
    await seedStorage(page, modelStorage([{ preset: 'groq' }, { preset: 'gemini' }]));
    await openDemo(page);
    const settings = await openSettings(page);
    await expect(row(settings, 'Groq').getByTestId('usage-bar')).toBeVisible();
    await expect(row(settings, 'Gemini').getByTestId('usage-bar')).toBeVisible();
  });
});

test.describe('Auto-switch', () => {
  const both: SeedModel[] = [{ preset: 'groq' }, { preset: 'gemini', fallback: true }];
  const limited = {
    status: 429,
    body: JSON.stringify({ error: { message: 'Rate limit reached' } }),
  };

  test('low usage: the next question uses the next model, and says so', async ({ page }) => {
    const groq = await mockProvider(page, GROQ_URL, { answer: 'Never.' });
    const gemini = await mockProvider(page, GEMINI_URL, { answer: 'From Gemini.' });
    const dialog = await askWith(page, both, {
      'swv:ai:usage': {
        groq: {
          windows: [
            {
              name: 'requests',
              unit: 'requests',
              limit: 100,
              remaining: 4,
              resetAt: Date.now() + 3_600_000,
            },
          ],
          readAt: Date.now(),
        },
      },
    });
    await dialog.getByRole('button', { name: 'Why this step?' }).click();
    const answer = answerOf(dialog);
    await expect(answer).toContainText('From Gemini.');
    await expect(answer.getByTestId('ask-notice')).toHaveText(
      'Groq is almost used up, switched to Gemini',
    );
    expect(groq).toHaveLength(0);
    expect(gemini).toHaveLength(1);
  });

  test('a 429: retries once on the next model, each with its own key', async ({ page }) => {
    const groq = await mockProvider(page, GROQ_URL, limited);
    const gemini = await mockProvider(page, GEMINI_URL, { answer: 'From Gemini.' });
    const dialog = await askWith(page, both);
    await dialog.getByRole('button', { name: 'Why this step?' }).click();
    const answer = answerOf(dialog);
    await expect(answer).toContainText('From Gemini.');
    await expect(answer).toContainText('Gemini · gemini-2.5-flash');
    await expect(answer.getByTestId('ask-notice')).toHaveText(
      'Groq limit reached, switched to Gemini',
    );
    expect(groq.map((c) => c.authorization)).toEqual(['Bearer groq-key']);
    expect(gemini.map((c) => c.authorization)).toEqual(['Bearer gemini-key']);
  });

  test('a bad key: no switch, and shown on that model', async ({ page }) => {
    const groq = await mockProvider(page, GROQ_URL, {
      status: 401,
      body: JSON.stringify({ error: { message: 'Invalid API Key' } }),
    });
    const gemini = await mockProvider(page, GEMINI_URL, { answer: 'Never.' });
    const dialog = await askWith(page, both);
    await dialog.getByRole('button', { name: 'Why this step?' }).click();
    await expect(answerOf(dialog)).toContainText(
      'Groq rejected the API key (401): Invalid API Key.',
    );
    expect(groq).toHaveLength(1);
    expect(gemini).toHaveLength(0);
  });

  test('a network error: tries the next model once', async ({ page }) => {
    const groq = await mockProvider(page, GROQ_URL, { abort: true });
    const gemini = await mockProvider(page, GEMINI_URL, { answer: 'From Gemini.' });
    const dialog = await askWith(page, both);
    await dialog.getByRole('button', { name: 'Why this step?' }).click();
    const answer = answerOf(dialog);
    await expect(answer).toContainText('From Gemini.');
    await expect(answer.getByTestId('ask-notice')).toHaveText(
      'Could not reach Groq, switched to Gemini',
    );
    expect(groq).toHaveLength(1);
    expect(gemini).toHaveLength(1);
  });

  test('all used up: a clear message with the earliest reset, and no loops', async ({ page }) => {
    const groq = await mockProvider(page, GROQ_URL, {
      ...limited,
      headers: { 'retry-after': '600' },
    });
    const gemini = await mockProvider(page, GEMINI_URL, {
      ...limited,
      headers: { 'retry-after': '120' },
    });
    const dialog = await askWith(page, both);
    await dialog.getByRole('button', { name: 'Why this step?' }).click();
    const answer = answerOf(dialog);
    await expect(answer).toContainText(
      'Every model has reached its limit. The earliest reset is at',
    );
    expect(groq).toHaveLength(1);
    expect(gemini).toHaveLength(1);

    await dialog.getByRole('button', { name: 'What if it fails?' }).click();
    await expect(answer).toContainText('What if it fails?');
    await expect(answer).toContainText(
      'Every model has reached its limit. The earliest reset is at',
    );
    expect(groq).toHaveLength(1);
    expect(gemini).toHaveLength(1);
  });

  test('a model not marked as a fallback is never used', async ({ page }) => {
    const groq = await mockProvider(page, GROQ_URL, limited);
    const gemini = await mockProvider(page, GEMINI_URL, { answer: 'Never.' });
    const dialog = await askWith(page, [{ preset: 'groq' }, { preset: 'gemini' }]);
    await dialog.getByRole('button', { name: 'Why this step?' }).click();
    await expect(answerOf(dialog)).toContainText('Every model has reached its limit');
    expect(groq).toHaveLength(1);
    expect(gemini).toHaveLength(0);
  });
});

test.describe('The answer cache', () => {
  test('a repeat makes no call, Ask again does, and the answer outlives a reload', async ({
    page,
  }) => {
    let answer = 'First answer.';
    const groq = await mockProvider(page, GROQ_URL, () => ({ answer }));
    const dialog = await askWith(page, [{ preset: 'groq' }]);
    const shown = answerOf(dialog);
    await dialog.getByRole('button', { name: 'Why this step?' }).click();
    await expect(shown).toContainText('First answer.');
    await expect(shown.getByText('Saved answer')).toBeHidden();
    expect(groq).toHaveLength(1);

    await dialog.getByRole('button', { name: 'Explain simpler' }).click();
    await expect(shown).toContainText('Explain simpler');
    await expect(shown).toContainText('First answer.');
    await dialog.getByRole('button', { name: 'Why this step?' }).click();
    await expect(shown.getByText('Saved answer')).toBeVisible();
    await expect(shown).toContainText('Groq · llama-3.3-70b-versatile');
    expect(groq).toHaveLength(2);

    answer = 'Second answer.';
    await dialog.getByRole('button', { name: 'Ask again' }).click();
    await expect(shown).toContainText('Second answer.');
    await expect(shown.getByText('Saved answer')).toBeHidden();
    expect(groq).toHaveLength(3);

    await page.reload();
    await diagramReady(page);
    const again = await openAskOnStep1(page);
    await again.getByRole('button', { name: 'Why this step?' }).click();
    await expect(answerOf(again).getByText('Saved answer')).toBeVisible();
    await expect(answerOf(again)).toContainText('Second answer.');
    expect(groq).toHaveLength(3);
  });

  test('another model reuses the answer, and says which one wrote it', async ({ page }) => {
    await mockProvider(page, GROQ_URL, { answer: 'From Groq.' });
    const gemini = await mockProvider(page, GEMINI_URL, { answer: 'From Gemini.' });
    const dialog = await askWith(page, [{ preset: 'groq' }, { preset: 'gemini' }]);
    await dialog.getByRole('button', { name: 'Why this step?' }).click();
    await expect(answerOf(dialog)).toContainText('From Groq.');
    await dialog
      .getByRole('combobox', { name: 'Model to ask first' })
      .selectOption({ label: 'Gemini' });
    await dialog.getByRole('button', { name: 'Explain simpler' }).click();
    await expect(answerOf(dialog)).toContainText('From Gemini.');
    expect(gemini).toHaveLength(1);
    await dialog.getByRole('button', { name: 'Why this step?' }).click();
    await expect(answerOf(dialog).getByText('Saved answer')).toBeVisible();
    await expect(answerOf(dialog)).toContainText('From Groq.');
    await expect(answerOf(dialog)).toContainText('Groq · llama-3.3-70b-versatile');
    expect(gemini).toHaveLength(1);
  });

  test('a changed flow does not reuse an answer about a step that changed', async ({ page }) => {
    const code = (text: string) => `sequenceDiagram
  %% @title Cache test
  %% @step ${text}
  A->>B: POST /hold
  %% @step The service confirms.
  B-->>A: 201 Created`;
    const groq = await mockProvider(page, GROQ_URL, { answer: 'An answer.' });
    await seedStorage(
      page,
      modelStorage([{ preset: 'groq' }], { 'swv:code': code('The first wording.') }),
    );
    await openDemo(page);
    const dialog = await openAskOnStep1(page);
    await dialog.getByRole('button', { name: 'Why this step?' }).click();
    await expect(answerOf(dialog)).toContainText('An answer.');
    expect(groq).toHaveLength(1);

    await page.evaluate((next) => {
      localStorage.setItem('swv:code', JSON.stringify(next));
    }, code('The second wording.'));
    await page.reload();
    await diagramReady(page);
    const changed = await openAskOnStep1(page);
    await changed.getByRole('button', { name: 'Why this step?' }).click();
    await expect(answerOf(changed)).toContainText('An answer.');
    await expect(answerOf(changed).getByText('Saved answer')).toBeHidden();
    expect(groq).toHaveLength(2);
  });

  test('an answer version 2 saved is still used, and settings show the size and clear it', async ({
    page,
  }) => {
    // The prompt is read from a first, ordinary call, then kept under version 2's hash.
    const groq = await mockProvider(page, GROQ_URL, { answer: 'From now.' });
    const first = await askWith(page, [{ preset: 'groq' }]);
    await first.getByRole('button', { name: 'Why this step?' }).click();
    await expect(answerOf(first)).toContainText('From now.');
    const prompt = groq[0]?.body.messages[1]?.content ?? '';

    await first.getByTitle('Models, keys and limits').click();
    const settings = page.getByRole('dialog', { name: 'AI settings', exact: true });
    await expect(settings.getByTestId('saved-answers')).toContainText('1 saved answer, about');
    await settings.getByRole('button', { name: 'Clear saved answers' }).click();
    await expect(settings.getByTestId('saved-answers')).toContainText('0 saved answers');
    await page.evaluate(
      ([name, saved]) => {
        localStorage.setItem('swv:ai:cache', JSON.stringify({ [name as string]: saved }));
      },
      [v2Hash(`gemini|${prompt}`), { a: 'Answered by version 2.', t: 1 }],
    );
    await page.reload();
    await diagramReady(page);

    const dialog = await openAskOnStep1(page);
    await dialog.getByRole('button', { name: 'Why this step?' }).click();
    await expect(answerOf(dialog)).toContainText('Answered by version 2.');
    await expect(answerOf(dialog).getByText('Saved answer')).toBeVisible();
    await expect(answerOf(dialog)).toContainText('Gemini');
    expect(groq).toHaveLength(1);

    await dialog.getByTitle('Models, keys and limits').click();
    const saved = page
      .getByRole('dialog', { name: 'AI settings', exact: true })
      .getByTestId('saved-answers');
    await expect(saved).toContainText('1 saved answer, about');
    await saved.getByRole('button', { name: 'Clear saved answers' }).click();
    await expect(saved).toContainText('0 saved answers');
    expect(await page.evaluate(() => localStorage.getItem('swv:ai:cache'))).toBeNull();
  });
});

test.describe('Keys and replies', () => {
  test('a malicious reply stays plain text and runs nothing', async ({ page }) => {
    const reply =
      '<img src=x onerror="window.__hacked = 1"><script>window.__hacked = 2</script><b>bold</b>';
    await mockProvider(page, GROQ_URL, { answer: reply });
    const dialog = await askWith(page, [{ preset: 'groq' }]);
    await dialog.getByRole('button', { name: 'Why this step?' }).click();
    const answer = answerOf(dialog);
    await expect(answer).toContainText(reply);
    await expect(answer.locator('img, script, b')).toHaveCount(0);
    expect(
      await page.evaluate(() => (window as unknown as { __hacked?: number }).__hacked),
    ).toBeUndefined();
  });

  test('a key shows up nowhere but its own request header', async ({ page }) => {
    const lines: string[] = [];
    const urls: string[] = [];
    page.on('console', (message) => lines.push(message.text()));
    page.on('pageerror', (error) => lines.push(error.message));
    page.on('request', (request) => urls.push(request.url(), request.postData() ?? ''));
    await mockProvider(page, GROQ_URL, () => ({ answer: 'Fine.' }));
    await mockProvider(page, GEMINI_URL, {
      status: 400,
      body: JSON.stringify({ error: { message: 'Bad model for key gemini-key' } }),
    });
    const dialog = await askWith(page, [{ preset: 'gemini' }, { preset: 'groq' }]);
    await dialog.getByRole('button', { name: 'Why this step?' }).click();
    const answer = answerOf(dialog);
    await expect(answer).toContainText('[key hidden]');
    await expect(answer).not.toContainText('gemini-key');

    await dialog
      .getByRole('combobox', { name: 'Model to ask first' })
      .selectOption({ label: 'Groq' });
    await dialog.getByRole('button', { name: 'Why this step?' }).click();
    await expect(answer).toContainText('Fine.');

    const saved = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('swv-ai');
        request.onsuccess = () => {
          resolve(request.result);
        };
        request.onerror = () => {
          reject(new Error('no database'));
        };
      });
      const all = db.transaction('answers').objectStore('answers').getAll();
      return new Promise<string>((resolve) => {
        all.onsuccess = () => {
          resolve(JSON.stringify(all.result));
        };
      });
    });
    expect(saved).toContain('Fine.');
    for (const text of [saved, ...urls, ...lines]) {
      expect(text).not.toContain('groq-key');
      expect(text).not.toContain('gemini-key');
    }
  });
});
