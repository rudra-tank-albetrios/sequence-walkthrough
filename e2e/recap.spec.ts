import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const TEST_KEY = 'gsk_recap_test_key';
const DEMO_FLOW = 't:Place an order';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const REPLY = JSON.stringify({
  groups: [
    { title: 'Holds', points: ['A hold keeps stock aside for one order.'], mistakes: [1] },
    { title: 'Replies', points: ['A bad body gets a 422.'], mistakes: [2] },
  ],
});

interface Seed {
  id: string;
  question: string;
  daysAgo?: number;
  flowId?: string;
  flow?: string;
  topic?: string;
  timesMissed?: number;
}

const DAY_MS = 86_400_000;

/** The little of IndexedDB these tests use in the page. This program has no DOM types. */
interface IdbRequest<T> {
  result: T;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
}
interface IdbStore {
  put: (value: unknown, key: string) => unknown;
  get: (key: string) => IdbRequest<unknown>;
}
interface IdbTransaction {
  objectStore: (name: string) => IdbStore;
  oncomplete: (() => void) | null;
  onerror: (() => void) | null;
}
interface IdbDatabase {
  createObjectStore: (name: string) => unknown;
  transaction: (store: string, mode?: string) => IdbTransaction;
  close: () => void;
}
declare const indexedDB: {
  open: (name: string) => IdbRequest<IdbDatabase> & { onupgradeneeded: (() => void) | null };
};

/** A record in the shape `shared/storage/weakPoints.ts` keeps, dated relative to this moment. */
// One clock for the run: seeding a record again must not read as a new miss.
const SEEDED_AT = Date.now();

const weakPoint = ({ id, question, daysAgo = 0, ...rest }: Seed) => ({
  id,
  flowId: DEMO_FLOW,
  flow: 'Place an order',
  step: 18,
  chapter: 'Reserve stock',
  topic: 'Stock holds',
  question,
  userAnswer: `My answer to ${id}`,
  correctAnswer: `The correct answer to ${id}`,
  whyWrong: `Why ${id} was wrong`,
  date: new Date(SEEDED_AT - daysAgo * DAY_MS).toISOString(),
  timesMissed: 1,
  ...rest,
});

/** Writes straight into the database the app reads, so a spec starts with known mistakes. */
async function seedWeakPoints(page: Page, seeds: Seed[]) {
  const points = seeds.map(weakPoint);
  await page.evaluate(
    (records) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('swv-data');
        open.onupgradeneeded = () => {
          open.result.createObjectStore('kv');
        };
        open.onerror = () => {
          reject(new Error('could not open the database'));
        };
        open.onsuccess = () => {
          const tx = open.result.transaction('kv', 'readwrite');
          tx.objectStore('kv').put(records, 'swv:weak-points');
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => {
            reject(new Error('could not write the mistakes'));
          };
        };
      }),
    points,
  );
}

async function openDemo(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('diagram').locator('svg').first()).toBeVisible({ timeout: 30_000 });
}

/** The one place that knows how the recap is reached: the header's Learn menu. */
async function openRecap(page: Page) {
  await page.getByRole('button', { name: 'Learn', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Day recap' }).click();
  const dialog = page.getByRole('dialog', { name: 'Day recap' });
  await expect(dialog.getByRole('group', { name: 'Period' })).toBeVisible();
  return dialog;
}

async function expectAccessibleDialog(page: Page) {
  // A button that just changed is still fading to its colours; axe must measure them at rest.
  await page
    .getByRole('dialog')
    .evaluate((el) =>
      Promise.all(
        (el as unknown as { getAnimations: (o: object) => { finished: Promise<unknown> }[] })
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished),
      ),
    );
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .include('[role="dialog"]')
    .analyze();
  expect(results.violations).toEqual([]);
}

/** What the app's database holds under a key, as JSON. */
const readStored = (page: Page, key: string) =>
  page.evaluate(
    (storeKey) =>
      new Promise<string>((resolve, reject) => {
        const open = indexedDB.open('swv-data');
        open.onerror = () => {
          reject(new Error('could not open the database'));
        };
        open.onsuccess = () => {
          const get = open.result.transaction('kv').objectStore('kv').get(storeKey);
          get.onsuccess = () => {
            open.result.close();
            resolve(JSON.stringify(get.result));
          };
        };
      }),
    key,
  );

/** Answers the provider URL with one fixed reply and counts every request that really left. */
async function mockProvider(page: Page, answer = REPLY) {
  const sent: { url: string; authorization: string; body: string }[] = [];
  await page.route(GROQ_URL, async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    sent.push({
      url: route.request().url(),
      authorization: route.request().headers().authorization ?? '',
      body: route.request().postData() ?? '',
    });
    await route.fulfill({
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ choices: [{ message: { content: answer } }] }),
    });
  });
  return sent;
}

/** Every request the page makes to anything but itself. The recap must make none of its own. */
function watchOutsideRequests(page: Page) {
  const outside: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith(new URL(page.url()).origin) && /^https?:/.test(request.url())) {
      outside.push(request.url());
    }
  });
  return outside;
}

/** One saved Groq model with a fake key, its host already announced. */
const setUpModel = (page: Page) =>
  page.addInitScript((key) => {
    const model = { id: 'm-test', name: 'Groq', preset: 'groq', model: 'test-model', key };
    localStorage.setItem('swv:ai:models', JSON.stringify({ models: [model], activeId: model.id }));
    localStorage.setItem('swv:ai:consent', JSON.stringify(['api.groq.com']));
  }, TEST_KEY);

const mistakes = (page: Page) => page.getByTestId('recap-mistake');

test.describe('day recap', () => {
  test('the built-in sample works on the demo flow with no key and no network', async ({
    page,
  }) => {
    await openDemo(page);
    const outside = watchOutsideRequests(page);
    const dialog = await openRecap(page);
    await expect(dialog.getByText(/^Sample recap\./)).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Today · 2' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Last 7 days · 4' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'All time · 5' })).toBeVisible();
    await expect(mistakes(page)).toHaveCount(2);
    await expect(page.getByTestId('recap-group').first()).toBeVisible();
    await expectAccessibleDialog(page);
    await dialog.getByRole('button', { name: 'All time · 5' }).click();
    await expect(mistakes(page)).toHaveCount(5);
    await expectAccessibleDialog(page);
    expect(outside).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('with no model the mistakes and correct answers still appear, with no error', async ({
    page,
  }) => {
    await openDemo(page);
    await seedWeakPoints(page, [{ id: 'q1', question: 'Why hold stock?' }]);
    const outside = watchOutsideRequests(page);
    const dialog = await openRecap(page);
    const card = mistakes(page).first();
    await expect(card.getByText('Why hold stock?')).toBeVisible();
    await expect(card.getByText('My answer to q1')).toBeVisible();
    await expect(card.getByText('Why q1 was wrong')).toBeVisible();
    await expect(card.getByText('The correct answer to q1')).toBeVisible();
    await expect(dialog.getByText(/No model is set up/)).toBeVisible();
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Analyse my mistakes' })).toHaveCount(0);
    await expectAccessibleDialog(page);
    expect(outside).toEqual([]);

    // Setting up a model opens over the recap, and closing it comes back to the recap
    await dialog.getByRole('button', { name: 'Add a model' }).click();
    const settings = page.getByRole('dialog', { name: /AI/ });
    await expect(settings).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(settings).toBeHidden();
    await expect(dialog.getByText(/No model is set up/)).toBeVisible();
  });

  test('mistakes are correct by period and by flow', async ({ page }) => {
    await openDemo(page);
    await seedWeakPoints(page, [
      { id: 'today', question: 'Missed today?' },
      { id: 'week', question: 'Missed three days ago?', daysAgo: 3 },
      { id: 'old', question: 'Missed long ago?', daysAgo: 20 },
      { id: 'other', question: 'Missed in another flow?', flowId: 't:Other', flow: 'Other flow' },
    ]);
    const dialog = await openRecap(page);
    await expect(mistakes(page)).toHaveCount(1);
    await expect(dialog.getByText('Missed today?')).toBeVisible();
    await dialog.getByRole('button', { name: 'Last 7 days · 2' }).click();
    await expect(mistakes(page)).toHaveCount(2);
    await expect(dialog.getByText('Missed three days ago?')).toBeVisible();
    await dialog.getByRole('button', { name: 'All time · 3' }).click();
    await expect(mistakes(page)).toHaveCount(3);
    await expect(dialog.getByText('Missed long ago?')).toBeVisible();
    await dialog.getByRole('button', { name: 'All flows' }).click();
    await expect(mistakes(page)).toHaveCount(4);
    await expect(dialog.getByText('Other flow', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Today · 2' }).click();
    await expect(mistakes(page)).toHaveCount(2);
    await expectAccessibleDialog(page);
  });

  test('the analysis is saved: after a reload nothing is sent until a new mistake appears', async ({
    page,
  }) => {
    await setUpModel(page);
    const sent = await mockProvider(page);
    await openDemo(page);
    await seedWeakPoints(page, [
      { id: 'q1', question: 'Why hold stock?', timesMissed: 2 },
      { id: 'q2', question: 'What does a bad body get?' },
    ]);

    // Opening alone sends nothing
    let dialog = await openRecap(page);
    const analyse = dialog.getByRole('button', { name: 'Analyse my mistakes' });
    await expect(analyse).toBeVisible();
    await expect(dialog.getByText(/Sends these questions, your answers/)).toContainText(
      'your model',
    );
    await expectAccessibleDialog(page);
    expect(sent).toHaveLength(0);

    // One request, to the provider's own URL, with the key only in its header
    await analyse.click();
    await expect(dialog.getByText('A hold keeps stock aside for one order.')).toBeVisible();
    await expect(dialog.getByText('Saved analysis')).toBeVisible();
    await expectAccessibleDialog(page);
    expect(sent).toHaveLength(1);
    const request = sent[0];
    expect(request?.url).toBe(GROQ_URL);
    expect(request?.authorization).toBe(`Bearer ${TEST_KEY}`);
    expect(request?.body).not.toContain(TEST_KEY);
    const body = JSON.parse(request?.body ?? '{}') as {
      max_tokens: number;
      messages: { content: string }[];
    };
    expect(body.max_tokens).toBeLessThanOrEqual(500);
    expect(body.messages[1]?.content).toContain('Why hold stock?');
    expect(body.messages[1]?.content).not.toMatch(/sequenceDiagram|%% @/);

    // Closing and opening again
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    dialog = await openRecap(page);
    await expect(dialog.getByText('A hold keeps stock aside for one order.')).toBeVisible();
    expect(sent).toHaveLength(1);

    // A reload: the mistakes and the analysis both come back from the browser's storage
    await page.reload();
    await expect(page.getByTestId('diagram').locator('svg').first()).toBeVisible({
      timeout: 30_000,
    });
    dialog = await openRecap(page);
    await expect(mistakes(page)).toHaveCount(2);
    await expect(dialog.getByText('A hold keeps stock aside for one order.')).toBeVisible();
    await expect(dialog.getByText('Saved analysis')).toBeVisible();
    expect(sent).toHaveLength(1);

    // The saved result holds no key
    const stored = await readStored(page, 'swv:recap:analysis');
    expect(stored).toContain('A hold keeps stock aside');
    expect(stored).not.toContain(TEST_KEY);

    // A new mistake ends it, and still only a click sends
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await seedWeakPoints(page, [
      { id: 'q1', question: 'Why hold stock?', timesMissed: 2, daysAgo: 0 },
      { id: 'q2', question: 'What does a bad body get?' },
      { id: 'q3', question: 'A brand new mistake?' },
    ]);
    dialog = await openRecap(page);
    await expect(dialog.getByText(/new mistakes since the last analysis/)).toBeVisible();
    await expect(dialog.getByText('A hold keeps stock aside for one order.')).toHaveCount(0);
    expect(sent).toHaveLength(1);
    await dialog.getByRole('button', { name: 'Analyse my mistakes' }).click();
    await expect(dialog.getByText('A hold keeps stock aside for one order.')).toBeVisible();
    expect(sent).toHaveLength(2);
  });

  test('a hostile model reply stays plain text and runs nothing', async ({ page }) => {
    const dialogs: string[] = [];
    page.on('dialog', async (alert) => {
      dialogs.push(alert.message());
      await alert.dismiss();
    });
    await setUpModel(page);
    await mockProvider(
      page,
      JSON.stringify({
        groups: [
          {
            title: '<img src=x onerror=alert(1)>',
            points: ['<script>alert(2)</script>', '[click me](javascript:alert(3))'],
            onClick: 'alert(4)',
          },
        ],
      }),
    );
    await openDemo(page);
    await seedWeakPoints(page, [{ id: 'q1', question: 'Why hold stock?' }]);
    const dialog = await openRecap(page);
    await dialog.getByRole('button', { name: 'Analyse my mistakes' }).click();
    await expect(dialog.getByText('<img src=x onerror=alert(1)>')).toBeVisible();
    await expect(dialog.getByText('<script>alert(2)</script>')).toBeVisible();
    await expect(dialog.locator('[data-testid="recap-group"] :is(img, script, a)')).toHaveCount(0);
    expect(dialogs).toEqual([]);
    await expectAccessibleDialog(page);
  });

  test('an unreadable reply is refused and nothing is saved', async ({ page }) => {
    await setUpModel(page);
    const sent = await mockProvider(page, 'Sorry, here is some prose.');
    await openDemo(page);
    await seedWeakPoints(page, [{ id: 'q1', question: 'Why hold stock?' }]);
    let dialog = await openRecap(page);
    await dialog.getByRole('button', { name: 'Analyse my mistakes' }).click();
    await expect(dialog.getByText(/could not be used/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(dialog.getByText(/some prose/)).toHaveCount(0);
    await expect(mistakes(page)).toHaveCount(1);
    await expectAccessibleDialog(page);
    expect(sent).toHaveLength(1);
    await page.keyboard.press('Escape');
    dialog = await openRecap(page);
    await expect(dialog.getByRole('button', { name: 'Analyse my mistakes' })).toBeVisible();
    await expect(dialog.getByText('Saved analysis')).toHaveCount(0);
    expect(await readStored(page, 'swv:recap:analysis')).toBeUndefined();
  });

  test('correct answers reduce the recap, and the saved analysis needs no new request', async ({
    page,
  }) => {
    await setUpModel(page);
    const sent = await mockProvider(page);
    await openDemo(page);
    const first = { id: 'q1', question: 'Why hold stock?', timesMissed: 2 };
    const second = { id: 'q2', question: 'What does a bad body get?' };
    await seedWeakPoints(page, [first, second]);
    let dialog = await openRecap(page);
    await expect(mistakes(page)).toHaveCount(2);
    await expect(dialog.getByText('Missed 2 times')).toBeVisible();
    await dialog.getByRole('button', { name: 'Analyse my mistakes' }).click();
    await expect(dialog.getByText('Saved analysis')).toBeVisible();
    expect(sent).toHaveLength(1);

    // What one correct answer leaves behind: the store takes one off the count
    await page.keyboard.press('Escape');
    await seedWeakPoints(page, [{ ...first, timesMissed: 1 }, second]);
    dialog = await openRecap(page);
    await expect(mistakes(page)).toHaveCount(2);
    await expect(dialog.getByText('Missed 2 times')).toHaveCount(0);
    await expect(dialog.getByText('A hold keeps stock aside for one order.')).toBeVisible();

    // And another: at zero the record is gone, and so is the group nothing is left in
    await page.keyboard.press('Escape');
    await seedWeakPoints(page, [second]);
    dialog = await openRecap(page);
    await expect(mistakes(page)).toHaveCount(1);
    await expect(dialog.getByText('Why hold stock?')).toHaveCount(0);
    await expect(dialog.getByText('A bad body gets a 422.')).toBeVisible();
    await expect(dialog.getByText('A hold keeps stock aside for one order.')).toHaveCount(0);
    expect(sent).toHaveLength(1);
    await expectAccessibleDialog(page);
  });

  test('Retry my mistakes leaves the agreed hand-over for the quiz and closes the recap', async ({
    page,
  }) => {
    await openDemo(page);
    await seedWeakPoints(page, [
      { id: 'q1', question: 'Why hold stock?', topic: 'Stock holds', timesMissed: 2 },
      { id: 'q2', question: 'What does a bad body get?', topic: 'Validation errors' },
      { id: 'q3', question: 'Missed long ago?', topic: 'Not today', daysAgo: 20 },
    ]);
    const dialog = await openRecap(page);
    await dialog.getByRole('button', { name: 'Retry my mistakes' }).click();
    await expect(dialog).toBeHidden();
    const retry = await page.evaluate(() => sessionStorage.getItem('swv:quiz:retry'));
    expect(JSON.parse(retry ?? 'null')).toEqual({
      topics: ['Stock holds', 'Validation errors'],
      flowId: DEMO_FLOW,
    });
  });

  test('works at phone width, in both colour schemes', async ({ page }) => {
    await openDemo(page);
    await seedWeakPoints(page, [{ id: 'q1', question: 'Why hold stock?' }]);
    const dialog = await openRecap(page);
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      await page.setViewportSize({ width: 360, height: 700 });
      await expect(mistakes(page).first()).toBeVisible();
      const overflow = await dialog.evaluate(
        (element: { scrollWidth: number; clientWidth: number }) =>
          element.scrollWidth - element.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      await expectAccessibleDialog(page);
    }
  });
});
