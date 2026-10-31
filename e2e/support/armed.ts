import { deflateSync } from 'node:zlib';

import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The tools of the security specs. Each attack calls the page function `__pwned('where')` if it
 * ever runs, and `arm` records that call, every Content Security Policy report, every request the
 * page tries and every uncaught error. An attack "did nothing" only when all of those stay empty
 * and no dangerous markup reached the page. The first tests in security.spec.ts prove these
 * detectors really fire, so a quiet result means something.
 */

export interface SecurityReport {
  /** The places attack code ran from. */
  fired: string[];
  /** Policy violations the browser reported. */
  csp: { directive: string; blocked: string }[];
  /** Dangerous elements and attributes found in the page right now. */
  dom: string[];
  /** Names added to Object.prototype since the page opened. */
  pollution: string[];
  /** Text the page sent to the clipboard, newest last. */
  clipboard: string[];
  /** Addresses the page tried to open with window.open. */
  opened: string[];
}

// Browser code stays in strings: the specs compile without the DOM library.
const ARM = String.raw`(() => {
  if (window.__sec) return;
  const fired = [];
  const csp = [];
  const clipboard = [];
  const opened = [];
  window.__pwned = (where) => { fired.push(String(where)); };
  for (const name of ['alert', 'confirm', 'prompt', 'print']) {
    window[name] = (text) => { fired.push(name + ': ' + String(text)); };
  }
  window.open = (url) => { opened.push(String(url)); return null; };
  addEventListener('securitypolicyviolation', (e) => {
    csp.push({ directive: e.effectiveDirective || e.violatedDirective, blocked: e.blockedURI });
  }, true);
  try {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text) => { clipboard.push(String(text)); } },
    });
  } catch { /* some documents have no navigator to change */ }
  const clean = new Set(Object.getOwnPropertyNames(Object.prototype));
  const NEVER = new Set(['iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'portal', 'base', 'animate', 'set']);
  const URL_ATTRS = new Set(['href', 'xlink:href', 'src', 'action', 'formaction', 'data', 'poster', 'background', 'style']);
  const scan = (root) => {
    const bad = [];
    const note = (el, why) => bad.push(why + ': ' + el.outerHTML.slice(0, 160));
    for (const el of root.querySelectorAll('*')) {
      const tag = el.localName.toLowerCase();
      if (tag === 'script') {
        const src = el.getAttribute('src');
        if (!src || new URL(src, location.href).origin !== location.origin) note(el, 'script');
      }
      if (NEVER.has(tag)) note(el, 'element');
      for (const attr of el.attributes) {
        const name = attr.name.toLowerCase();
        const value = attr.value.replace(/[\u0000- ]/g, '').toLowerCase();
        if (/^on[a-z]+$/.test(name)) note(el, 'event handler');
        if (name === 'data-pwn' || name === 'srcdoc') note(el, 'markup from the attack');
        if (!URL_ATTRS.has(name)) continue;
        if (/^(javascript|vbscript|livescript):|^data:text\/html/.test(value)) note(el, 'script address');
        const opensSafely = tag === 'a' && (el.getAttribute('rel') || '').includes('noopener');
        if (value.includes('evil.example') && !opensSafely) note(el, 'outside address');
      }
    }
    return bad;
  };
  window.__sec = () => ({
    fired,
    csp,
    clipboard,
    opened,
    dom: scan(document),
    pollution: Object.getOwnPropertyNames(Object.prototype).filter((name) => !clean.has(name)),
  });
})()`;

export interface LoggedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

export interface Armed {
  page: Page;
  /** Every request the page tried, in order, even one the page's policy stopped at once. */
  requests: LoggedRequest[];
  /** Addresses on other sites that got past the page's policy and reached the network. */
  outside: string[];
  /** Everything the page printed to its console. */
  console: string[];
  /** Exceptions nothing caught. */
  pageErrors: string[];
}

const isWeb = (url: string): boolean => /^https?:/i.test(url);

/**
 * Starts recording on a page, before it opens anything. Requests to other sites are refused here,
 * so a hostile page cannot reach the network even when an attack gets through.
 */
export async function arm(page: Page, baseURL: string | undefined): Promise<Armed> {
  const armed: Armed = { page, requests: [], outside: [], console: [], pageErrors: [] };
  const origin = new URL(baseURL ?? 'http://127.0.0.1').origin;
  await page.addInitScript(ARM);
  page.on('request', (request) => {
    if (!isWeb(request.url())) return;
    armed.requests.push({
      url: request.url(),
      method: request.method(),
      headers: request.headers(),
      body: request.postData() ?? '',
    });
  });
  page.on('console', (message) => armed.console.push(message.text()));
  page.on('pageerror', (error) => armed.pageErrors.push(error.message));
  await page.route(
    (url) => isWeb(url.href) && url.origin !== origin,
    (route) => {
      armed.outside.push(route.request().url());
      return route.abort('blockedbyclient');
    },
  );
  return armed;
}

export const readReport = (page: Page): Promise<SecurityReport> =>
  page.evaluate<SecurityReport>('window.__sec()');

/** The wait for a late error handler. The control tests prove the attacks fire within it. */
export const SETTLE_MS = 300;

/**
 * The verdict of every attack: nothing ran, no dangerous markup reached the page, nothing was added
 * to Object.prototype, nothing left for another site and nothing was thrown.
 */
export async function expectNothingRan(armed: Armed, what: string): Promise<SecurityReport> {
  await armed.page.waitForTimeout(SETTLE_MS);
  const report = await readReport(armed.page);
  expect(report.fired, `${what}: attack code ran`).toEqual([]);
  expect(report.dom, `${what}: dangerous markup reached the page`).toEqual([]);
  expect(report.pollution, `${what}: Object.prototype changed`).toEqual([]);
  expect(report.opened, `${what}: a window was opened`).toEqual([]);
  expect(armed.outside, `${what}: a request left for another site`).toEqual([]);
  expect(armed.pageErrors, `${what}: an uncaught error`).toEqual([]);
  return report;
}

const base64url = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64url');

/** Share links in every form the viewer reads. */
export const shareLink = {
  z: (code: string): string => `/#z.${base64url(deflateSync(code))}`,
  pako: (code: string): string =>
    `/#pako:${base64url(deflateSync(JSON.stringify({ code, mermaid: '{"theme":"default"}' })))}`,
  base64: (code: string): string => `/#base64:${base64url(Buffer.from(JSON.stringify({ code })))}`,
};

export const diagramSvg = (page: Page) => page.getByTestId('diagram').locator('svg').first();

export const flowTitle = (page: Page) => page.getByRole('heading', { level: 1 });

/** Opens the page at the address and waits until a diagram is drawn. */
export async function openDrawn(page: Page, address: string): Promise<void> {
  await page.goto(address);
  await expect(diagramSvg(page)).toBeVisible({ timeout: 30_000 });
}

/** Opens the viewer on a small, safe flow, ready for an attack to replace it. */
export async function openSafeFlow(page: Page): Promise<void> {
  await openDrawn(page, shareLink.z('sequenceDiagram\n  %% @title Safe\n  A->>B: hello'));
  await expect(flowTitle(page)).toHaveText('Safe');
}

/**
 * The ways diagram text enters the viewer once it is open. Each ends when the viewer has the new
 * code, so the caller can look for its effects.
 */
export const deliveries: Record<string, (page: Page, code: string) => Promise<void>> = {
  'the code panel': async (page, code) => {
    await page.keyboard.press('c');
    await page.getByRole('textbox', { name: 'Diagram code' }).fill(code);
    await page.keyboard.press('Escape');
  },
  'the file picker': async (page, code) => {
    await page.getByTestId('import-file').setInputFiles({
      name: 'attack.mmd',
      mimeType: 'text/plain',
      buffer: Buffer.from(code),
    });
  },
  'a Markdown file': async (page, code) => {
    await page.getByTestId('import-file').setInputFiles({
      name: 'attack.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from(`# Notes\n\n\`\`\`mermaid\n${code}\n\`\`\`\n`),
    });
  },
  'the import dialog': async (page, code) => {
    await page.getByRole('button', { name: /^Export/ }).click();
    await page.getByRole('menuitem', { name: /^Paste a link or code/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Import' });
    await dialog.getByRole('textbox').fill(code);
    await dialog.getByRole('button', { name: 'Load' }).click();
    await expect(dialog).toBeHidden();
  },
  'a paste on the page': async (page, code) => {
    await dispatchPaste(page, code);
  },
  'a drop on the page': async (page, code) => {
    await dispatchDrop(page, 'attack.mmd', code);
  },
};

/** A real handler runs: only the event's data is made here, so this works in every browser. */
export async function dispatchPaste(page: Page, text: string): Promise<void> {
  await page.evaluate(
    `(() => {
      const event = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: { getData: () => ${JSON.stringify(text)} } });
      document.body.dispatchEvent(event);
    })()`,
  );
}

export async function dispatchDrop(page: Page, name: string, text: string): Promise<void> {
  await page.evaluate(
    `(() => {
      const file = new File([${JSON.stringify(text)}], ${JSON.stringify(name)}, { type: 'text/plain' });
      const event = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'dataTransfer', { value: { types: ['Files'], files: [file] } });
      document.body.dispatchEvent(event);
    })()`,
  );
}

/** Puts values in browser storage before the page opens, as if an earlier visit had left them. */
export async function seedStorage(page: Page, values: Record<string, string>): Promise<void> {
  await page.addInitScript(
    `for (const [key, value] of Object.entries(${JSON.stringify(values)})) {
      try { localStorage.setItem(key, value); } catch { /* an opaque document has no storage */ }
    }`,
  );
}

/** Moves the pointer to the centre of the first match that is inside the viewport. */
async function pointAt(page: Page, targets: Locator): Promise<void> {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('No viewport');
  const tried: string[] = [];
  for (const target of await targets.all()) {
    const box = await target.boundingBox();
    if (!box) {
      tried.push('not rendered');
      continue;
    }
    // The centre of the part that is on screen: a wide arrow's middle may be off to the side.
    const left = Math.max(box.x, 0);
    const top = Math.max(box.y, 0);
    const right = Math.min(box.x + box.width, viewport.width);
    const bottom = Math.min(box.y + box.height, viewport.height);
    if (right - left < 4 || bottom - top < 2) {
      tried.push(`(${Math.round(box.x)}, ${Math.round(box.y)}) is outside the viewport`);
      continue;
    }
    const x = (left + right) / 2;
    const y = (top + bottom) / 2;
    // The pinned header draws a copy of the actor row over the original: either one answers.
    const under = await target.evaluate(
      (el, point) => {
        const scope = globalThis as unknown as {
          document: {
            elementFromPoint: (
              x: number,
              y: number,
            ) => { closest: (s: string) => unknown; tagName: string; className: unknown } | null;
          };
        };
        const hit = scope.document.elementFromPoint(point.x, point.y);
        if (hit === null) return 'nothing';
        if (hit === el || hit.closest('.swv-actor, .swv-hit') !== null) return 'ok';
        return `${hit.tagName}.${String(hit.className)}`;
      },
      { x, y },
    );
    if (under !== 'ok') {
      tried.push(`(${Math.round(x)}, ${Math.round(y)}) is covered by ${under}`);
      continue;
    }
    await page.mouse.move(x, y);
    return;
  }
  throw new Error(`No target is inside the viewport and uncovered: ${tried.join('; ')}`);
}

/**
 * Takes the hostile flow through every screen that shows diagram text: each step, the tooltips,
 * notes, Insight's tabs, the table, the code panel with its lint notes, presenter mode and Find.
 */
export async function walkEveryScreen(page: Page, steps: number): Promise<void> {
  const key = (name: string) => page.keyboard.press(name);
  const tooltip = page.getByTestId('arrow-tooltip');

  // The overview fits every layer on the screen, and a step brings its own arrow into view.
  await pointAt(page, page.locator('.swv-actor'));
  await expect(tooltip).toBeVisible();
  await page.mouse.move(0, 0);
  await page.getByTestId('diagram').focus();
  await key('ArrowRight');
  await pointAt(page, page.locator('.swv-hit[data-step="0"]'));
  await expect(tooltip).toBeVisible();
  for (let i = 1; i < steps; i++) await key('ArrowRight');

  await key('b');
  await key('n');
  await page.getByTestId('note-ta').fill(`<img src=x onerror="__pwned('note')">`);
  await key('Escape');
  await expect(page.getByTestId('note-view')).toContainText('onerror=');

  await key('i');
  const insight = page.getByTestId('insight');
  await expect(insight).toBeVisible();
  const tabs = insight.getByRole('tab');
  for (let i = 0; i < (await tabs.count()); i++) await tabs.nth(i).click();
  await insight.getByRole('button', { name: 'Close the Insight panel' }).click();

  await key('t');
  await expect(page.locator('#tableView table')).toBeVisible();
  await key('t');

  await key('c');
  await expect(page.getByRole('textbox', { name: 'Diagram code' })).toBeVisible();
  await page.locator('#codePanel').getByRole('button', { name: 'Copy fix-prompt' }).click();
  await key('c');

  await key('/');
  await page.keyboard.type('onerror');
  await key('Enter');
  await key('Escape');

  await page.getByTestId('diagram').focus();
  await key('p');
  await key('Escape');
}
