import { expect, test, type Page } from '@playwright/test';

import {
  arm,
  deliveries,
  diagramSvg,
  dispatchDrop,
  expectNothingRan,
  flowTitle,
  openDrawn,
  openSafeFlow,
  readReport,
  seedStorage,
  SETTLE_MS,
  shareLink,
  walkEveryScreen,
} from './support/armed.ts';
import {
  CONFIG_ATTACKS,
  HOSTILE_FLOW,
  HOSTILE_STEPS,
  OTHER_DIAGRAMS,
  REFUSED_CODE,
} from './support/attacks.ts';

// Plan section 4 and the Security row of section 10: hostile diagram text runs nothing. Most tests
// here turn the page's Content Security Policy off, because the sanitiser and React must hold on
// their own. The policy has its own tests in security.exports.spec.ts, and the attacks that matter
// most run both ways.

/** The markup of each form of attack, written straight into the page. */
const injectRawMarkup = (html: string): string =>
  `document.body.append(document.createRange().createContextualFragment(${JSON.stringify(html)}))`;

/** The id of the current drawing. Each new drawing has its own. */
const drawingId = (page: Page) =>
  page.evaluate<string>(
    `document.querySelector('[data-testid="diagram"] svg')?.id ?? ''`,
  );

/** 'drawn' or 'refused' once the code dropped after this drawing has been dealt with, else ''. */
const drawingEnded = (page: Page, before: string) =>
  page.evaluate<string>(
    `(() => {
      if (document.querySelector('[data-testid="err-badge"]')) return 'refused';
      const id = document.querySelector('[data-testid="diagram"] svg')?.id ?? '';
      return id && id !== ${JSON.stringify(before)} ? 'drawn' : '';
    })()`,
  );

test.describe('the detectors work', () => {
  const RUNS_FROM_MARKUP = [
    `<img src=x onerror="__pwned('control-img')">`,
    `<script>__pwned('control-script')</script>`,
    `<iframe srcdoc="<script>top.__pwned('control-iframe')</script>"></iframe>`,
    `<details open ontoggle="__pwned('control-details')"></details>`,
  ];

  test.describe('with the policy off', () => {
    test.use({ bypassCSP: true });

    test('attack markup that reaches the page does run, and is reported', async ({
      page,
      baseURL,
    }) => {
      await arm(page, baseURL);
      await openSafeFlow(page);
      await page.evaluate(injectRawMarkup(RUNS_FROM_MARKUP.join('')));
      await page.waitForTimeout(SETTLE_MS);
      const report = await readReport(page);
      expect([...report.fired].sort()).toEqual([
        'control-details',
        'control-iframe',
        'control-img',
        'control-script',
      ]);
      expect(report.dom.length).toBeGreaterThanOrEqual(3);
    });

    test('a request to another site is recorded', async ({ page, baseURL }) => {
      const armed = await arm(page, baseURL);
      await openSafeFlow(page);
      await page.evaluate(injectRawMarkup('<img src="https://evil.example/control.png">'));
      await expect.poll(() => armed.outside).toEqual(['https://evil.example/control.png']);
    });
  });

  test('with the policy on, the same markup is blocked and the browser reports it', async ({
    page,
    baseURL,
  }) => {
    const armed = await arm(page, baseURL);
    await openSafeFlow(page);
    await page.evaluate(
      injectRawMarkup(`${RUNS_FROM_MARKUP.join('')}<img src="https://evil.example/control.png">`),
    );
    await page.waitForTimeout(SETTLE_MS);
    const report = await readReport(page);
    expect(report.fired).toEqual([]);
    expect(report.csp.length).toBeGreaterThan(0);
    expect(armed.outside).toEqual([]);
  });
});

for (const policy of ['on', 'off'] as const) {
  test.describe(`hostile diagram text, with the page's policy ${policy}`, () => {
    test.use({ bypassCSP: policy === 'off' });

    test('every annotation and label on every screen, from a #z. link', async ({
      page,
      baseURL,
    }) => {
      test.slow();
      const armed = await arm(page, baseURL);
      await openDrawn(page, shareLink.z(HOSTILE_FLOW));
      // The attack reached the page as words: the title shows its own markup as text.
      await expect(flowTitle(page)).toContainText(`<img src=x onerror="__pwned('title')"`);
      await expect(diagramSvg(page).locator('[data-step]').first()).toBeAttached();
      await expectNothingRan(armed, 'on load');
      await walkEveryScreen(page, HOSTILE_STEPS);
      await expectNothingRan(armed, 'after every screen');
    });

    test('Mermaid config attacks do not loosen anything', async ({ page, baseURL }) => {
      test.slow();
      const armed = await arm(page, baseURL);
      for (const [name, code] of Object.entries(CONFIG_ATTACKS)) {
        await page.goto('about:blank');
        await openDrawn(page, shareLink.z(code));
        await page.getByTestId('diagram').locator('svg g, svg text').first().hover({ force: true });
        await expectNothingRan(armed, name);
      }
    });
  });
}

test.describe('hostile diagram text, sanitiser alone', () => {
  test.use({ bypassCSP: true });

  for (const [form, link] of Object.entries(shareLink)) {
    test(`a share link in the ${form} form runs nothing`, async ({ page, baseURL }) => {
      const armed = await arm(page, baseURL);
      await openDrawn(page, link(HOSTILE_FLOW));
      await expect(flowTitle(page)).toContainText('onerror=');
      await page.keyboard.press('ArrowRight');
      await expect(page.getByTestId('step-card')).toContainText('onerror=');
      await expectNothingRan(armed, form);
    });
  }

  for (const [name, deliver] of Object.entries(deliveries)) {
    test(`${name} runs nothing`, async ({ page, baseURL }) => {
      const armed = await arm(page, baseURL);
      await openSafeFlow(page);
      await deliver(page, HOSTILE_FLOW);
      await expect(flowTitle(page)).toContainText('onerror=');
      await expect(diagramSvg(page).locator('[data-step]').first()).toBeAttached();
      await page.getByTestId('diagram').focus();
      await page.keyboard.press('ArrowRight');
      await expect(page.getByTestId('step-card')).toContainText('onerror=');
      await expectNothingRan(armed, name);
    });
  }

  test('other kinds of diagram run nothing, and their links and callbacks are dead', async ({
    page,
    baseURL,
  }) => {
    test.slow();
    const armed = await arm(page, baseURL);
    await openSafeFlow(page);
    const address = page.url();
    const drawn: string[] = [];
    for (const [name, code] of Object.entries(OTHER_DIAGRAMS)) {
      const before = await drawingId(page);
      await dispatchDrop(page, `${name}.mmd`, code);
      await expect.poll(() => drawingEnded(page, before)).not.toBe('');
      if ((await drawingEnded(page, before)) === 'drawn') drawn.push(name);
      // Mermaid's own handlers would answer these clicks. The page never binds them.
      await page.evaluate(
        `document.querySelectorAll('[data-testid="diagram"] svg :is(.node, .clickable, .actor, .task, a, [class*="click"])')
          .forEach((el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))`,
      );
      await expectNothingRan(armed, name);
      expect(page.url()).toBe(address);
    }
    // The attacks only mean something for the kinds Mermaid really drew.
    expect(drawn).toEqual(
      expect.arrayContaining(['flowchart', 'classDiagram', 'stateDiagram', 'erDiagram', 'gantt']),
    );
  });

  test('code Mermaid refuses shows its error as plain text', async ({ page, baseURL }) => {
    const armed = await arm(page, baseURL);
    await page.goto(shareLink.z(REFUSED_CODE));
    await expect(page.getByTestId('err-badge')).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press('c');
    await expect(page.getByRole('textbox', { name: 'Diagram code' })).toBeVisible();
    await expectNothingRan(armed, 'refused code');
  });

  test('a file that is not a diagram is refused, and its name is plain text', async ({
    page,
    baseURL,
  }) => {
    const armed = await arm(page, baseURL);
    await openSafeFlow(page);
    await dispatchDrop(page, 'evil.html', `<script>__pwned('html-file')</script>`);
    await dispatchDrop(page, 'evil.svg', `<svg onload="__pwned('svg-file')"></svg>`);
    await dispatchDrop(page, 'evil.mmd.html', `<img src=x onerror="__pwned('double-extension')">`);
    await expect(flowTitle(page)).toHaveText('Safe');
    const name = `<img src=x onerror="__pwned('file-name')">.md`;
    await dispatchDrop(page, name, 'no mermaid block in here');
    await expect(page.getByRole('status').filter({ hasText: 'has no' })).toContainText('onerror=');
    await expect(flowTitle(page)).toHaveText('Safe');
    await expectNothingRan(armed, 'files');
  });

  test('a link with a broken or odd state leaves the page working', async ({ page, baseURL }) => {
    const armed = await arm(page, baseURL);
    const odd = [
      '/#z.not-really-deflate',
      '/#pako:AAAA',
      '/#base64:bm90IGpzb24',
      `/#base64:${Buffer.from(JSON.stringify({ code: { a: 1 } })).toString('base64url')}`,
      '/#step=99999999999',
      '/#step=-1',
      `${shareLink.z('sequenceDiagram\nA->>B: x')}&step=99999999999`,
    ];
    for (const address of odd) {
      await page.goto('about:blank');
      await openDrawn(page, address);
      await expectNothingRan(armed, address);
    }
  });
});

test.describe('words that name members of Object', () => {
  const ANNOTATIONS = `sequenceDiagram
  %% @title Words
  %% @layer A kind=__proto__ one
  %% @layer B kind=constructor two
  %% @layer __proto__ kind=db three
  %% @term __proto__: a word
  %% @term constructor: a word
  %% @uses __proto__ constructor text
  %% @uses constructor __proto__ text
  A->>B: __proto__ constructor #constructor;
  B-->>A: toString
  A->>__proto__: three
  __proto__-->>A: 200 ok
`;

  test('in annotations and names do not crash any screen', async ({ page, baseURL }) => {
    test.slow();
    const armed = await arm(page, baseURL);
    await openDrawn(page, shareLink.z(ANNOTATIONS));
    await expect(flowTitle(page)).toHaveText('Words');
    await walkEveryScreen(page, 4);
    await expect(flowTitle(page)).toHaveText('Words');
    await expectNothingRan(armed, 'object words');
  });

  test('as statements, which Mermaid refuses, leave the page working', async ({
    page,
    baseURL,
  }) => {
    const armed = await arm(page, baseURL);
    await page.goto(shareLink.z(`${ANNOTATIONS}__proto__ one\nconstructor two\ntoString three\n`));
    await expect(page.getByTestId('err-badge')).toBeVisible({ timeout: 30_000 });
    await expect(flowTitle(page)).toBeVisible();
    await page.keyboard.press('c');
    await expect(page.getByRole('textbox', { name: 'Diagram code' })).toBeVisible();
    await expectNothingRan(armed, 'object words as statements');
  });
});

test.describe('large input', () => {
  // A share link needs only a few kilobytes to carry any of these.
  const nest = (n: number) =>
    `sequenceDiagram\n${'alt x\n'.repeat(n)}${'A->>B: y\n'.repeat(n)}${'end\n'.repeat(n)}`;
  const HUGE: Record<string, string> = {
    'deep nesting': nest(20_000),
    'many unanswered replies': `sequenceDiagram\n${'A-->>B: y\n'.repeat(40_000)}`,
    'many terms': `sequenceDiagram\n${Array.from({ length: 30_000 }, (_, i) => `%% @term t${i}: x`).join('\n')}\nA->>B: y`,
    'one very long line': `sequenceDiagram\nA->>B: ${'<img src=x onerror=__pwned(1)>'.repeat(50_000)}`,
    'a long run of markup in a note': `sequenceDiagram\nNote over A: ${'<b>'.repeat(200_000)}`,
  };

  for (const [name, code] of Object.entries(HUGE)) {
    test(`${name} leaves the page working`, async ({ page, baseURL }) => {
      const armed = await arm(page, baseURL);
      await openSafeFlow(page);
      await dispatchDrop(page, 'huge.mmd', code);
      await expect(flowTitle(page)).not.toHaveText('Safe');
      // The page still answers.
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNothingRan(armed, name);
    });
  }

  test('a compressed link that expands to gigabytes is refused', async ({ page, baseURL }) => {
    const armed = await arm(page, baseURL);
    const bomb = shareLink.z(`sequenceDiagram\n%%${' '.repeat(256 * 1024 * 1024)}`);
    expect(bomb.length).toBeLessThan(600_000);
    await page.goto(bomb);
    await expect(diagramSvg(page)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('status').filter({ hasText: 'could not be read' })).toBeVisible();
    await expectNothingRan(armed, 'link bomb');
  });
});

test.describe('malicious values left in browser storage', () => {
  const FLOW = 'sequenceDiagram\n  %% @title Stored\n  A->>B: hello\n  B-->>A: 200 ok';
  const STEP_KEY = 'A→B|hello';
  const html = `<img src=x onerror="__pwned('stored')" data-pwn>`;
  const notes = (value: unknown) => JSON.stringify(value);

  const STORED: Record<string, Record<string, string>> = {
    'settings with markup and wrong types': {
      'swv:settings': JSON.stringify({
        theme: html,
        wheel: html,
        dim: html,
        grid: html,
        speed: html,
        bands: html,
        cardH: 'calc(100vh); background: url(https://evil.example/s.png)',
        fold: html,
      }),
    },
    'settings that are not an object': { 'swv:settings': '[1,2,3]' },
    'settings that are not JSON': { 'swv:settings': '{not json' },
    'saved code that is not text': { 'swv:code': '{"a":1}' },
    'saved code that is a number': { 'swv:code': '123' },
    'notes with markup': {
      'swv:notes:t:Stored': notes({
        [STEP_KEY]: { star: true, note: html, n: 1, route: html, label: html, updated: html },
        [`${html}→B|gone`]: { star: true, note: html, route: html, label: html, updated: html },
      }),
    },
    'notes that are null': { 'swv:notes:t:Stored': 'null' },
    'notes that are a list': { 'swv:notes:t:Stored': '[1,2,3]' },
    'notes with entries of the wrong type': {
      'swv:notes:t:Stored': notes({
        [STEP_KEY]: { star: 'yes', note: 123 },
        'A→B|other': 'text',
        'A→B|empty': null,
        'A→B|list': [1],
      }),
    },
    'notes of another flow that are null': { 'swv:notes:t:Other': 'null' },
    'notes that target the prototype': {
      'swv:notes:t:Stored': '{"__proto__":{"star":true,"note":"x"},"constructor":{"star":true,"note":"x"}}',
    },
    'glossary with markup': {
      'swv:terms:t:Stored': JSON.stringify({
        hello: { term: 'hello', def: html, updated: html },
        [html]: { term: html, def: html, updated: '' },
      }),
    },
    'glossary that is null': { 'swv:terms:t:Stored': 'null' },
    'glossary with entries of the wrong type': {
      'swv:terms:t:Stored': JSON.stringify({ a: 'text', b: null, c: { term: 1, def: 2 }, d: [1] }),
    },
    'AI settings with markup and wrong types': {
      'swv:ai': JSON.stringify({
        provider: html,
        keys: { groq: 1, custom: html },
        models: html,
        customUrl: `javascript:__pwned('stored-url')`,
        includePayload: html,
        autoNote: html,
        mode: html,
      }),
    },
    'an AI answer cache that is not an object': { 'swv:ai:cache': '"text"' },
    'an AI answer cache that is null': { 'swv:ai:cache': 'null' },
  };

  for (const [name, values] of Object.entries(STORED)) {
    test(`${name} run nothing and break nothing`, async ({ page, baseURL }) => {
      const armed = await arm(page, baseURL);
      await seedStorage(page, values);
      await openDrawn(page, shareLink.z(FLOW));
      await expect(flowTitle(page)).toHaveText('Stored');
      await page.getByTestId('diagram').focus();
      await page.keyboard.press('ArrowRight');
      await expect(page.getByTestId('step-card')).toBeVisible();
      await page.keyboard.press('a');
      await expect(page.getByRole('dialog', { name: /^Ask AI about step/ })).toBeVisible();
      await page.keyboard.press('Escape');
      await page.getByTestId('bm-btn').click();
      await expect(page.getByRole('heading', { name: 'Bookmarks and notes' })).toBeVisible();
      await page.keyboard.press('Escape');
      await page.keyboard.press('i');
      await page.getByTestId('insight').getByRole('tab', { name: /Glossary/ }).click();
      await expectNothingRan(armed, name);
    });
  }

  for (const [name, stored] of Object.entries({
    'an object': '{"a":1}',
    'a number': '123',
    'null': 'null',
    'a list': '[1]',
    'broken JSON': '{nope',
  })) {
    test(`saved code that is ${name} leaves the page on its demo`, async ({ page, baseURL }) => {
      const armed = await arm(page, baseURL);
      await seedStorage(page, { 'swv:code': stored });
      await openDrawn(page, '/');
      await expect(flowTitle(page)).toBeVisible();
      await expectNothingRan(armed, name);
    });
  }

  test('saved code that is hostile is shown as text when the page reopens', async ({
    page,
    baseURL,
  }) => {
    const armed = await arm(page, baseURL);
    await seedStorage(page, { 'swv:code': JSON.stringify(HOSTILE_FLOW) });
    await openDrawn(page, '/');
    await expect(flowTitle(page)).toContainText('onerror=');
    await expectNothingRan(armed, 'saved code');
  });

});

test.describe('a malicious notes file', () => {
  const FLOW = 'sequenceDiagram\n  %% @title Noted\n  A->>B: hello\n  B-->>A: 200 ok';
  const html = `<img src=x onerror="__pwned('notes-file')" data-pwn>`;

  async function importNotes(page: import('@playwright/test').Page, content: string) {
    await page.getByTestId('bm-btn').click();
    await page.getByRole('heading', { name: 'Bookmarks and notes' }).waitFor();
    await page.getByLabel('Notes file').setInputFiles({
      name: 'notes.json',
      mimeType: 'application/json',
      buffer: Buffer.from(content),
    });
  }

  test('markup in a note stays plain text on every screen', async ({ page, baseURL }) => {
    const armed = await arm(page, baseURL);
    await openDrawn(page, shareLink.z(FLOW));
    const file = JSON.stringify({
      format: 'swv-notes/1',
      notes: {
        'A→B|hello': { star: true, note: html, route: html, label: html, updated: '2099' },
        [`${html}→B|gone`]: { star: true, note: html, route: html, label: html, updated: '2099' },
      },
    });
    await importNotes(page, file);
    await expect(page.getByRole('status').filter({ hasText: 'Imported 2 notes' })).toBeVisible();
    await expect(page.getByText('onerror=').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByTestId('diagram').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('note-view')).toContainText('onerror=');
    await page.keyboard.press('t');
    await expect(page.locator('#tableView')).toContainText('onerror=');
    await expectNothingRan(armed, 'notes file');
  });

  const BROKEN: Record<string, string> = {
    'not JSON': '{nope',
    'no notes': '{"format":"swv-notes/1"}',
    'a list': '[1,2,3]',
    null: 'null',
    'notes of the wrong type': '{"notes":"text"}',
    'entries of the wrong type': '{"notes":{"a":1,"b":null,"c":[1],"d":"x"}}',
    'fields of the wrong type': '{"notes":{"a":{"star":"yes","note":1,"n":"x","route":2,"label":3,"updated":4}}}',
    'keys that target the prototype':
      '{"notes":{"__proto__":{"star":true,"note":"x","updated":"z"},"constructor":{"star":true,"note":"x","updated":"z"}}}',
  };

  for (const [name, content] of Object.entries(BROKEN)) {
    test(`a file with ${name} breaks nothing`, async ({ page, baseURL }) => {
      const armed = await arm(page, baseURL);
      await openDrawn(page, shareLink.z(FLOW));
      await importNotes(page, content);
      await page.keyboard.press('Escape');
      await page.getByTestId('diagram').focus();
      await page.keyboard.press('ArrowRight');
      await expect(page.getByTestId('step-card')).toBeVisible();
      await expectNothingRan(armed, name);
    });
  }
});
