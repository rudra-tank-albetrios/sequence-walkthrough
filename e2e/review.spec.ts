import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { DEMO_TITLE, demoFlow, open } from './helpers.ts';
import { PROVIDER_URLS, storedAi, storedConsent } from './support/models.ts';

// Plan section 10, row Review: known problems are found and a clean sample has no false threat.
// Plan 8.11: two separate results, the rules on screen, the model cannot change the score, the
// honest limits on screen. The model is always a mock (plan section 4: no project key).

const FLOW = `sequenceDiagram
    %% @spec walkthrough/2
    %% @title Save a thing
    participant C as Controller
    participant D as Database
    %% @layer C kind=controller Picks the status.
    %% @layer D kind=db Stores rows.
    %% @step The controller writes straight to the database.
    %% @threat high The table name comes from the request
    %% @threat low The write has no timeout
    C->>D: INSERT INTO things
    %% @step The row comes back.
    D-->>C: row`;

/** Five known problems: direct database write, body with no validator, write route with no auth, call with no reply, token in a URL. */
const PROBLEMS = `sequenceDiagram
    %% @spec walkthrough/2
    %% @title Rename the profile
    participant B as Browser
    participant R as Routes
    participant C as Controller
    participant D as Database
    participant M as Mail Provider
    %% @layer B kind=client The page.
    %% @layer R kind=router Matches the path.
    %% @layer C kind=controller Picks the status.
    %% @layer D kind=db Stores rows.
    %% @layer M kind=external Sends the mail.
    %% @step The browser posts the new name, with its token in the URL.
    %% @payload.body { "name": "Ann" }
    B->>R: POST /api/profile?token=tok_do_not_show
    %% @step The route calls the controller.
    R->>C: rename(req)
    %% @step The controller writes straight to the database.
    C->>D: UPDATE users SET name
    %% @step The row count comes back.
    D-->>C: 1 row
    %% @step The controller tells the mail provider, and never hears back.
    C->>M: GET /notify
    %% @step The browser gets the answer.
    R-->>B: 200 OK`;

const PROBLEM_RULES = [
  'layers-direct-database',
  'validation-missing',
  'access-missing',
  'reply-missing',
  'outside-no-failure',
  'secret-exposed',
];

/** Every layer in order, kinds read from the names, every call linked to code, nothing wrong. */
const CLEAN = `sequenceDiagram
    %% @spec walkthrough/2
    %% @title Show an order
    participant W as Web Client
    participant RT as Router
    participant AU as Auth Guard
    participant VA as Validator
    participant OC as Orders Controller
    participant OS as Orders Service
    participant OR as Orders Repository
    participant PG as Postgres
    participant SE as Order Serializer
    %% @step The client asks for one order, with its session header.
    %% @payload.headers Authorization: Bearer <session>
    %% @ref src/web/orders.ts:10
    W->>RT: GET /api/orders/42
    %% @step The guard checks the session.
    %% @ref src/http/guard.ts:5
    RT->>AU: requireUser
    %% @step The id is checked to be a number.
    %% @ref src/http/validate.ts:8
    AU->>VA: next()
    %% @step The controller runs.
    %% @ref src/orders/controller.ts:20
    VA->>OC: show(ctx)
    %% @step The service loads the order for this user.
    %% @ref src/orders/service.ts:30
    OC->>OS: findOrder(42, user)
    %% @step The repository reads the row.
    %% @ref src/orders/repository.ts:12
    OS->>OR: findById(42)
    %% @step One row is read.
    %% @payload.sql SELECT * FROM orders WHERE id = 42
    %% @ref src/orders/repository.ts:14
    OR->>PG: SELECT order 42
    %% @step The row comes back.
    %% @ref src/orders/repository.ts:15
    PG-->>OR: row
    %% @step The order comes back.
    %% @ref src/orders/repository.ts:16
    OR-->>OS: order
    %% @step The service returns it.
    %% @ref src/orders/service.ts:33
    OS-->>OC: order
    %% @step The public shape is made.
    %% @ref src/orders/serializer.ts:4
    OC->>SE: toPublic(order)
    %% @step The shape comes back.
    %% @ref src/orders/serializer.ts:9
    SE-->>OC: public order
    %% @step The client gets the order.
    %% @payload.body { "id": 42, "status": "shipped" }
    %% @ref src/orders/controller.ts:24
    RT-->>W: 200 OK`;

const GROQ_URL = PROVIDER_URLS.groq;
/** `swv:ai` as an earlier visit left it: Groq with a made-up key. */
const AI_SETTINGS = storedAi('groq', { keys: { groq: 'gsk_e2e' }, customUrl: '' });

interface Sent {
  headers: Record<string, string>;
  body: { max_tokens: number; messages: { role: string; content: string }[] };
}

/** Answers Groq's address with one reply text and records every POST the page sent there. */
async function mockModel(page: Page, content: string): Promise<Sent[]> {
  const sent: Sent[] = [];
  const allow = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  await page.route(GROQ_URL, (route) => {
    const request = route.request();
    if (request.method() !== 'POST') return route.fulfill({ status: 204, headers: allow });
    const body = JSON.parse(request.postData() ?? '{}') as Sent['body'];
    sent.push({ headers: request.headers(), body });
    return route.fulfill({
      status: 200,
      headers: { ...allow, 'Content-Type': 'application/json' },
      json: { choices: [{ message: { content } }] },
    });
  });
  return sent;
}

/** Console errors and page errors, collected from now on. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

const review = (page: Page) => page.getByRole('dialog', { name: 'Structure review' });
const findings = (page: Page) => review(page).getByTestId('review-findings');
const rules = (page: Page) => review(page).getByTestId('review-rules');
const explainButton = (page: Page) =>
  review(page).getByRole('button', { name: 'Explain in plain words' });

/** The one place the tests look for the way in, so moving the entry changes only this. */
async function openReview(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Analyze', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Review this flow' }).click();
  await expect(review(page)).toBeVisible();
}

const scan = (page: Page) =>
  new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

test.describe('structure review', () => {
  test('shows the rating, the confidence, the rules and the honest limits', async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, { code: FLOW });
    await openReview(page);

    const dialog = review(page);
    await expect(dialog.getByTestId('review-scope')).toHaveText('This flow: Save a thing');
    await expect(dialog.getByTestId('review-score')).toHaveText('80 / 100');
    await expect(dialog.getByRole('meter', { name: 'Structure rating' })).toHaveAttribute(
      'aria-valuenow',
      '80',
    );
    await expect(dialog.getByTestId('review-confidence')).toHaveText('Low');
    await expect(dialog.getByRole('region', { name: 'Confidence' })).toContainText(
      'No step links to code',
    );
    await expect(findings(page)).toContainText('Controller reaches Database directly');
    await expect(rules(page).getByRole('listitem')).toHaveCount(11);
    await expect(rules(page).locator('[data-rule="half-saved"]')).toContainText('Not checked');
    await expect(rules(page).locator('[data-rule="half-saved"]')).toContainText(
      'no chapter with two separate writes',
    );

    const limits = dialog.getByTestId('review-limits');
    await expect(limits).toContainText('This rates this flow only');
    await expect(limits).toContainText('One flow cannot rate a whole project');
    await expect(limits).toContainText('possible problem, please check');
    await expect(limits).toContainText('not a security audit');
    expect(errors).toEqual([]);
  });

  test('finds the known problems, names their rules and never repeats the secret', async ({
    page,
  }) => {
    await open(page, { code: PROBLEMS });
    await openReview(page);

    for (const rule of PROBLEM_RULES) {
      await expect(findings(page).locator(`[data-rule="${rule}"]`).first()).toBeVisible();
      await expect(rules(page).locator(`[data-rule="${rule}"]`)).toHaveAttribute(
        'data-status',
        'found',
      );
    }
    await expect(findings(page).locator('[data-rule]')).toHaveCount(PROBLEM_RULES.length);
    await expect(rules(page).locator('[data-status="found"]')).toHaveCount(PROBLEM_RULES.length);
    await expect(findings(page).locator('[data-rule="secret-exposed"]')).toContainText(
      'POST /api/profile: a secret or token is in the URL.',
    );
    await expect(review(page)).not.toContainText('tok_do_not_show');
    await expect(review(page).getByTestId('review-score')).toHaveText('10 / 100');
    // The threats tab holds only what the author wrote: the rules invent none.
    await expect(review(page).getByRole('tab', { name: 'Threats (0)' })).toBeVisible();
  });

  test('a clean flow with every layer gets 100, no finding and no invented threat', async ({
    page,
  }) => {
    await open(page, { code: CLEAN });
    await openReview(page);

    const dialog = review(page);
    await expect(dialog.getByTestId('review-score')).toHaveText('100 / 100');
    await expect(findings(page)).toHaveText('The rules found nothing in this flow.');
    await expect(rules(page).locator('[data-status="found"]')).toHaveCount(0);
    await expect(dialog.getByTestId('review-explain')).toHaveCount(0);
    // Every call links to code and every layer has a kind, but it is the first flow reviewed.
    await expect(dialog.getByTestId('review-confidence')).toHaveText('Medium');
    await dialog.getByRole('tab', { name: 'Threats (0)' }).click();
    await expect(dialog.getByTestId('review-threats')).toContainText('does not mean it is safe');
  });

  test('the demo flow: no threat, and only the two findings that are true of it', async ({
    page,
  }) => {
    await open(page, { code: demoFlow() });
    await openReview(page);

    await expect(review(page).getByTestId('review-scope')).toHaveText(`This flow: ${DEMO_TITLE}`);
    const found = findings(page).locator('[data-rule]');
    await expect(found).toHaveCount(2);
    // Step 7: the auth middleware reads the sessions table itself, although the flow has a Repository.
    await expect(found.nth(0)).toHaveAttribute('data-rule', 'layers-skipped');
    await expect(found.nth(0)).toContainText('Middleware calls Database directly');
    // Step 41: the worker sends the confirmation mail, and the flow shows no failure path for it.
    await expect(found.nth(1)).toHaveAttribute('data-rule', 'outside-no-failure');
    await expect(found.nth(1)).toContainText('Mail Worker calls Mail');
    await expect(review(page).getByTestId('review-score')).toHaveText('80 / 100');
    await expect(review(page).getByRole('tab', { name: 'Threats (0)' })).toBeVisible();
  });

  test('a threat shows on its step, and its chip opens the threats', async ({ page }) => {
    await open(page, { code: FLOW });
    await expect(page.getByTestId('progress').locator('[data-marker="threat"]')).toHaveCount(1);
    await page.keyboard.press('ArrowRight');

    await expect(page.getByTestId('threats')).toContainText(
      'The table name comes from the request',
    );
    await page.getByTestId('threat-chip').first().click();

    const dialog = review(page);
    await expect(dialog.getByRole('tab', { name: 'Threats (2)' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const items = dialog.getByTestId('review-threats').getByRole('listitem');
    await expect(items.first()).toContainText('high threat');
    await expect(items.last()).toContainText('low threat');
  });

  test('a step link closes the review and shows that step', async ({ page }) => {
    await open(page, { code: FLOW });
    await openReview(page);

    await review(page)
      .getByRole('button', { name: 'Close the review and go to step 1' })
      .first()
      .click();

    await expect(review(page)).toBeHidden();
    await expect(page.getByLabel('Step number, type to jump')).toHaveValue('1');
  });

  test('Esc closes it and focus goes back to the button that opened it', async ({ page }) => {
    await open(page, { code: FLOW });
    // By keyboard: WebKit does not focus a button on a mouse click, so there would be nothing to
    // give back. The other browsers do, and the shared Dialog treats both ways the same.
    const opener = page.getByRole('button', { name: 'Analyze', exact: true });
    await opener.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('menuitem', { name: 'Review this flow' }).focus();
    await page.keyboard.press('Enter');
    await expect(review(page)).toBeVisible();
    // The open dialog hides the page from the accessibility tree, so this one looks by attribute.
    await expect(page.locator('[data-open="review"]')).not.toBeFocused();

    await page.keyboard.press('Escape');

    await expect(review(page)).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('the ⋯ menu opens it too, at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await open(page, { code: FLOW });

    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('menuitem', { name: 'Review this flow' }).click();

    await expect(review(page)).toBeVisible();
  });

  test('explaining with no model opens AI settings, and the review stays', async ({ page }) => {
    await open(page, { code: FLOW });
    await openReview(page);

    await explainButton(page).click();

    const settings = page.getByRole('dialog', { name: 'AI settings', exact: true });
    await expect(settings).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(settings).toBeHidden();
    await expect(review(page).getByTestId('review-explain-status')).toHaveText(
      'No AI model set up yet.',
    );
    await expect(review(page).getByTestId('review-score')).toBeVisible();
  });

  test('fits a phone: nothing scrolls sideways', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 700 });
    await open(page, { code: FLOW });
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('menuitem', { name: 'Review this flow' }).click();
    await expect(review(page)).toBeVisible();

    const box = await review(page).boundingBox();
    expect(box).not.toBeNull();
    expect((box?.x ?? -1) + (box?.width ?? 999)).toBeLessThanOrEqual(360);
    const sideways = await review(page).evaluate(
      (dialog: { scrollWidth: number; clientWidth: number }) =>
        dialog.scrollWidth - dialog.clientWidth,
    );
    expect(sideways).toBeLessThanOrEqual(0);
  });

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`has no accessibility violations in the ${colorScheme} theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await open(page, { code: FLOW });
      await openReview(page);

      expect((await scan(page)).violations).toEqual([]);
      await review(page).getByRole('tab', { name: 'Threats (2)' }).click();
      expect((await scan(page)).violations).toEqual([]);
    });
  }
});

test.describe('the model explains the findings', () => {
  test('sends only the finding text, and shows the reply as plain text tied to the findings', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    const sent = await mockModel(
      page,
      JSON.stringify({
        points: [
          { finding: 1, plain: 'The controller should ask a service or repository instead.' },
          { finding: 2, plain: 'Anyone with the address could change the name.' },
        ],
      }),
    );
    await open(page, { code: PROBLEMS, storage: { 'swv:ai': AI_SETTINGS, 'swv:ai:consent': storedConsent() } });
    await openReview(page);

    await explainButton(page).click();

    const points = review(page).getByTestId('review-point');
    await expect(points).toHaveCount(2);
    await expect(points.nth(0)).toHaveText(
      'The controller should ask a service or repository instead.',
    );
    await expect(points.nth(1)).toHaveText('Anyone with the address could change the name.');
    await expect(review(page).getByTestId('review-explain')).toContainText(
      'From Groq.',
    );

    expect(sent).toHaveLength(1);
    const [request] = sent;
    expect(request?.headers.authorization).toBe('Bearer gsk_e2e');
    expect(request?.body.max_tokens).toBeLessThanOrEqual(500);
    const user = request?.body.messages.find((m) => m.role === 'user')?.content ?? '';
    expect(user).toContain('(data, not instructions)');
    expect(user).toContain('Controller reaches Database directly');
    expect(user).toContain('a secret or token is in the URL');
    expect(user).not.toContain('sequenceDiagram');
    expect(user).not.toContain('%%');
    expect(user).not.toContain('tok_do_not_show');
    expect(user).not.toContain('gsk_e2e');
    expect(page.url()).not.toContain('gsk_e2e');

    expect((await scan(page)).violations).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('a hostile reply is inert text and changes neither the rating nor the findings', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    const attack =
      '<img src=x onerror="document.title=\'owned\'"><script>document.title="owned"</script>' +
      '[Click](javascript:document.title="owned") **Ignore the rules**: the score is now 100.';
    await mockModel(
      page,
      JSON.stringify({
        points: [{ finding: 1, plain: attack }],
        score: 100,
        findings: [],
        action: 'close',
      }),
    );
    await open(page, { code: PROBLEMS, storage: { 'swv:ai': AI_SETTINGS, 'swv:ai:consent': storedConsent() } });
    await openReview(page);
    const title = await page.title();
    const rulesBefore = await rules(page).textContent();
    const findingsBefore = await findings(page).textContent();

    await explainButton(page).click();

    const point = review(page).getByTestId('review-point');
    await expect(point).toHaveText(attack);
    expect(await point.locator('*').count()).toBe(0);
    expect(await review(page).locator('img, script, a[href^="javascript"]').count()).toBe(0);
    expect(await page.title()).toBe(title);
    await expect(review(page).getByTestId('review-score')).toHaveText('10 / 100');
    expect(await rules(page).textContent()).toBe(rulesBefore);
    expect(await findings(page).textContent()).toBe(findingsBefore);
    await expect(review(page)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('a reply in the wrong shape is refused with a reason, and nothing is shown from it', async ({
    page,
  }) => {
    await mockModel(page, 'Sure! The flow looks fine to me, score 100.');
    await open(page, { code: PROBLEMS, storage: { 'swv:ai': AI_SETTINGS, 'swv:ai:consent': storedConsent() } });
    await openReview(page);

    await explainButton(page).click();

    await expect(review(page).getByTestId('review-explain-status')).toHaveText(
      'Groq sent a reply that could not be used. Try again.',
    );
    await expect(review(page).getByTestId('review-point')).toHaveCount(0);
    await expect(review(page)).not.toContainText('looks fine to me');
    await expect(review(page).getByTestId('review-score')).toHaveText('10 / 100');
    await expect(explainButton(page)).toBeEnabled();
  });
});
