import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { expect, test, type Page } from '@playwright/test';

import {
  arm,
  expectNothingRan,
  openDrawn,
  seedStorage,
  shareLink,
  type Armed,
} from './support/armed.ts';
import {
  ALL_SENTINELS,
  HTTP_PROVIDERS,
  mockModel,
  modelPosts,
  postsTo,
  PROVIDER_URLS,
  SENTINEL_KEYS,
  storedAi,
} from './support/models.ts';

// Plan section 4: a key stays in this browser and goes only to its own URL. It never appears in a
// URL, a log, an export, the cache or a bug report. These tests read the network log, with made-up
// keys and mocked providers, and always with the page's policy on, as a person would have it.

const FLOW = `sequenceDiagram
  %% @title Keyed
  %% @step The first step
  A->>B: hello
  B-->>A: 200 ok`;

const CHIP = 'Why this step?';

async function openAsk(page: Page) {
  await openDrawn(page, shareLink.z(FLOW));
  await page.getByTestId('diagram').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('a');
  const dialog = page.getByRole('dialog', { name: 'Ask AI about step 1' });
  await expect(dialog).toBeVisible();
  return dialog;
}

const openSettings = async (page: Page) => {
  const dialog = await openAsk(page);
  await dialog.getByTitle('Provider, key, model').click();
  const settings = page.getByRole('dialog', { name: 'Ask AI', exact: true });
  await expect(settings).toBeVisible();
  return settings;
};

/** Every place in the network log that holds one of the made-up keys. */
function keysInNetworkLog(armed: Armed, keys: readonly string[] = ALL_SENTINELS): string[] {
  const found: string[] = [];
  for (const request of armed.requests) {
    for (const key of keys) {
      if (request.url.includes(key)) found.push(`${key} in the address ${request.url}`);
      if (request.body.includes(key)) found.push(`${key} in the body to ${request.url}`);
      for (const [name, value] of Object.entries(request.headers)) {
        if (value.includes(key)) found.push(`${key} in ${name} to ${request.url}`);
      }
    }
  }
  return found;
}

/** Every browser store and page text that holds one of the made-up keys. */
const keysInBrowser = (page: Page, keys: readonly string[] = ALL_SENTINELS) =>
  page.evaluate<string[]>(
    `(async () => {
      const keys = ${JSON.stringify(keys)};
      const holds = (text) => keys.some((key) => String(text).includes(key));
      const found = [];
      for (const [name, area] of [['localStorage', localStorage], ['sessionStorage', sessionStorage]]) {
        for (let i = 0; i < area.length; i++) {
          const key = area.key(i);
          if (holds(key) || holds(area.getItem(key))) found.push(name + ':' + key);
        }
      }
      if (holds(document.cookie)) found.push('cookie');
      if (holds(location.href)) found.push('address');
      if (holds(document.documentElement.outerHTML)) found.push('page markup');
      if (holds(document.title)) found.push('title');
      const asked = (request) =>
        new Promise((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      if (self.indexedDB && indexedDB.databases) {
        for (const { name } of await indexedDB.databases()) {
          const db = await asked(indexedDB.open(name));
          for (const storeName of db.objectStoreNames) {
            const store = db.transaction(storeName).objectStore(storeName);
            const held = [await asked(store.getAll()), await asked(store.getAllKeys())];
            if (holds(JSON.stringify(held))) found.push('indexedDB:' + name + ':' + storeName);
          }
          db.close();
        }
      }
      if (self.caches) {
        for (const name of await caches.keys()) {
          for (const request of await (await caches.open(name)).keys()) {
            if (holds(request.url)) found.push('cache:' + request.url);
          }
        }
      }
      return found;
    })()`,
  );

const expectNoKeyInLogs = (armed: Armed) => {
  const logs = [...armed.console, ...armed.pageErrors].join('\n');
  for (const key of ALL_SENTINELS) expect(logs).not.toContain(key);
};

test.describe('each key goes only to its own address', () => {
  for (const provider of HTTP_PROVIDERS) {
    test(`${provider}, read from the network log`, async ({ page, baseURL }) => {
      const armed = await arm(page, baseURL);
      await seedStorage(page, { 'swv:ai': storedAi(provider) });
      for (const url of Object.values(PROVIDER_URLS)) await mockModel(armed, url, 'An answer.');
      const dialog = await openAsk(page);
      await dialog.getByRole('button', { name: CHIP }).click();
      await expect(dialog.getByTestId('ask-answer')).toContainText('An answer.');

      const url = PROVIDER_URLS[provider];
      expect(modelPosts(armed).map((r) => r.url)).toEqual([url]);
      const key = SENTINEL_KEYS[provider];
      expect(keysInNetworkLog(armed)).toEqual(key ? [`${key} in authorization to ${url}`] : []);
      expect(postsTo(armed, url)[0]?.headers.authorization).toBe(key ? `Bearer ${key}` : undefined);

      // A share link holds the whole diagram: it must not reach a provider in a Referer.
      const referer = postsTo(armed, url)[0]?.headers.referer ?? '';
      expect(referer).not.toContain('#');
      expect(referer).not.toContain('z.');

      expectNoKeyInLogs(armed);
      expect(await keysInBrowser(page)).toEqual(['localStorage:swv:ai']);
      await expectNothingRan(armed, provider);
    });
  }

  test('a key typed in the settings goes only to its provider, for Test and for a question', async ({
    page,
    baseURL,
  }) => {
    const armed = await arm(page, baseURL);
    for (const url of Object.values(PROVIDER_URLS)) await mockModel(armed, url, 'OK');
    const settings = await openSettings(page);
    const key = SENTINEL_KEYS.mistral ?? '';
    await settings.getByRole('radio', { name: /Mistral/ }).check();
    await settings.getByLabel('API key').fill(key);

    await settings.getByRole('button', { name: 'Test' }).click();
    await expect(settings.getByRole('status')).toContainText('Works.');
    expect(modelPosts(armed).map((r) => r.url)).toEqual([PROVIDER_URLS.mistral]);
    expect(await keysInBrowser(page)).toEqual([]);

    await settings.getByRole('button', { name: 'Save' }).click();
    await expect(settings).toBeHidden();
    await page.getByRole('button', { name: CHIP }).click();
    await expect(page.getByTestId('ask-answer')).toContainText('OK');

    expect(modelPosts(armed).map((r) => r.url)).toEqual([
      PROVIDER_URLS.mistral,
      PROVIDER_URLS.mistral,
    ]);
    expect(keysInNetworkLog(armed)).toEqual([
      `${key} in authorization to ${PROVIDER_URLS.mistral}`,
      `${key} in authorization to ${PROVIDER_URLS.mistral}`,
    ]);
    expectNoKeyInLogs(armed);
    expect(await keysInBrowser(page)).toEqual(['localStorage:swv:ai']);
  });

  test('the saved answers and the note hold no key', async ({ page, baseURL }) => {
    const armed = await arm(page, baseURL);
    await seedStorage(page, { 'swv:ai': storedAi('groq') });
    await mockModel(armed, PROVIDER_URLS.groq, 'An answer.');
    const dialog = await openAsk(page);
    await dialog.getByRole('button', { name: CHIP }).click();
    await expect(dialog.getByTestId('ask-answer')).toContainText("Saved to this step's note");
    const saved = await page.evaluate<(string | null)[]>(
      `[localStorage.getItem('swv:ai:cache'), localStorage.getItem('swv:notes:t:Keyed')]`,
    );
    expect(saved[0]).toContain('An answer.');
    expect(saved[1]).toContain('An answer.');
    for (const key of ALL_SENTINELS) expect(saved.join()).not.toContain(key);
  });

  test('a provider that repeats the key in an error does not get it shown, saved or logged', async ({
    page,
    baseURL,
  }) => {
    const armed = await arm(page, baseURL);
    await seedStorage(page, { 'swv:ai': storedAi('groq') });
    const key = SENTINEL_KEYS.groq ?? '';
    await mockModel(armed, PROVIDER_URLS.groq, {
      status: 401,
      body: JSON.stringify({ error: { message: `Incorrect API key provided: ${key}` } }),
    });
    const dialog = await openAsk(page);
    await dialog.getByRole('button', { name: CHIP }).click();
    await expect(dialog.getByTestId('ask-answer')).toContainText('401');
    await expect(dialog.getByTestId('ask-answer')).not.toContainText(key);
    expectNoKeyInLogs(armed);
    expect(await keysInBrowser(page)).toEqual(['localStorage:swv:ai']);
  });

  test('a reply that repeats the key does not get it shown or saved', async ({ page, baseURL }) => {
    const armed = await arm(page, baseURL);
    await seedStorage(page, { 'swv:ai': storedAi('groq') });
    const key = SENTINEL_KEYS.groq ?? '';
    await mockModel(armed, PROVIDER_URLS.groq, `Your key is ${key}, is it not?`);
    const dialog = await openAsk(page);
    await dialog.getByRole('button', { name: CHIP }).click();
    await expect(dialog.getByTestId('ask-answer')).toContainText('Your key is');
    await expect(dialog.getByTestId('ask-answer')).not.toContainText(key);
    expectNoKeyInLogs(armed);
    expect(await keysInBrowser(page)).toEqual(['localStorage:swv:ai']);
  });
});

test.describe('custom model addresses', () => {
  const ACCEPTED = [
    'https://models.good.example/v1/chat/completions',
    'HTTPS://MODELS.GOOD.EXAMPLE/v1/chat/completions',
    'http://localhost:8080/v1/chat/completions',
    'http://127.0.0.1:9000/v1/chat/completions',
    'http://LOCALHOST:8080/v1/chat/completions',
  ];

  for (const address of ACCEPTED) {
    test(`${address} is accepted`, async ({ page, baseURL }) => {
      const armed = await arm(page, baseURL);
      const normal = new URL(address).href;
      await mockModel(armed, normal, 'OK');
      await seedStorage(page, { 'swv:ai': storedAi('custom', { customUrl: address }) });
      const settings = await openSettings(page);
      await settings.getByRole('button', { name: 'Test' }).click();
      await expect(settings.getByRole('status')).toContainText('Works.');
      expect(postsTo(armed, normal)).toHaveLength(1);
    });
  }

  const REFUSED = [
    'http://evil.example/v1/chat/completions',
    'ftp://evil.example/v1',
    'ws://localhost:8080/v1',
    `javascript:__pwned('custom-url')`,
    `JaVaScRiPt:__pwned('custom-url')`,
    `data:text/html,<script>__pwned('custom-url')</script>`,
    'blob:https://evil.example/1',
    'file:///etc/passwd',
    'http://localhost.evil.example/v1',
    'http://127.0.0.1.evil.example/v1',
    'http://localhost@evil.example/v1',
    'http://evil.example/localhost',
    'http://evil.example/?h=localhost',
    'http://evil.example#localhost',
    'http://10.0.0.1/v1',
    'http://[::ffff:7f00:1]/v1',
    '//evil.example/v1',
    'evil.example/v1',
    'localhost:8080/v1',
  ];

  for (const address of REFUSED) {
    test(`${address} is refused, typed or stored`, async ({ page, baseURL }) => {
      const armed = await arm(page, baseURL);
      await seedStorage(page, { 'swv:ai': storedAi('custom', { customUrl: address }) });

      // From what an earlier visit stored.
      const dialog = await openAsk(page);
      await dialog.getByRole('button', { name: CHIP }).click();
      await expect(dialog.getByTestId('ask-answer')).toContainText('endpoint URL');

      // Typed into the settings.
      await dialog.getByTitle('Provider, key, model').click();
      const settings = page.getByRole('dialog', { name: 'Ask AI', exact: true });
      await settings.getByLabel('Endpoint URL').fill(address);
      await settings.getByRole('button', { name: 'Test' }).click();
      await expect(settings.getByRole('status')).toContainText('Failed:');

      expect(armed.requests.filter((r) => r.method !== 'GET')).toEqual([]);
      expect(keysInNetworkLog(armed)).toEqual([]);
      await expectNothingRan(armed, address);
    });
  }

  test('an address with a user name in it sends nothing', async ({ page, baseURL }) => {
    const armed = await arm(page, baseURL);
    await seedStorage(page, {
      'swv:ai': storedAi('custom', { customUrl: 'https://user:secret@models.good.example/v1' }),
    });
    const dialog = await openAsk(page);
    await dialog.getByRole('button', { name: CHIP }).click();
    await expect(dialog.getByTestId('ask-answer')).toBeVisible();
    await expect(dialog.getByTestId('ask-answer').getByText('Thinking…')).toBeHidden();
    expect(armed.requests.filter((r) => r.method !== 'GET')).toEqual([]);
    expect(keysInNetworkLog(armed)).toEqual([]);
    await expectNothingRan(armed, 'a user name in the address');
  });

  test('a saved key does not follow a changed address', async ({ page, baseURL }) => {
    const armed = await arm(page, baseURL);
    const other = 'https://other.good.example/v1/chat/completions';
    await mockModel(armed, PROVIDER_URLS.custom, 'OK');
    await mockModel(armed, other, 'OK');
    await seedStorage(page, { 'swv:ai': storedAi('custom') });
    const settings = await openSettings(page);
    await expect(settings.getByLabel('API key')).toHaveValue(SENTINEL_KEYS.custom ?? '');

    await settings.getByLabel('Endpoint URL').fill(other);
    await expect(settings.getByLabel('API key')).toHaveValue('');
    await settings.getByRole('button', { name: 'Test' }).click();
    await expect(settings.getByRole('status')).toContainText('Works.');
    expect(postsTo(armed, other)[0]?.headers.authorization).toBeUndefined();

    await settings.getByRole('button', { name: 'Save' }).click();
    await expect(settings).toBeHidden();
    await page.getByRole('button', { name: CHIP }).click();
    await expect(page.getByTestId('ask-answer')).toContainText('OK');
    expect(postsTo(armed, other)).toHaveLength(2);
    expect(keysInNetworkLog(armed, [SENTINEL_KEYS.custom ?? ''])).toEqual([]);
    expect(await page.evaluate<string>(`localStorage.getItem('swv:ai')`)).not.toContain(
      SENTINEL_KEYS.custom,
    );
  });
});

test.describe('a model address that redirects', () => {
  interface Hit {
    url: string;
    method: string;
    authorization: string | undefined;
  }

  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  /** A real server on this computer, because a browser treats a real redirect its own way. */
  async function serve(answer: (req: IncomingMessage) => { status: number; location?: string }) {
    const hits: Hit[] = [];
    const server: Server = createServer((req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS).end();
        return;
      }
      hits.push({
        url: req.url ?? '',
        method: req.method ?? '',
        authorization: req.headers.authorization,
      });
      const { status, location } = answer(req);
      res
        .writeHead(status, {
          ...CORS,
          'Content-Type': 'application/json',
          ...(location ? { Location: location } : {}),
        })
        .end(JSON.stringify({ choices: [{ message: { content: 'From the second address.' } }] }));
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address() as AddressInfo;
    const stop = () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      });
    return { hits, port, stop };
  }

  for (const kind of ['another site', 'the same site'] as const) {
    test(`to ${kind} takes neither the key nor the question with it`, async ({ page, baseURL }) => {
      const second = await serve(() => ({ status: 200 }));
      const first = await serve((req) =>
        req.url === '/v1'
          ? {
              status: 307,
              location:
                kind === 'another site' ? `http://127.0.0.1:${second.port}/steal` : '/steal',
            }
          : { status: 200 },
      );
      try {
        const armed = await arm(page, baseURL);
        await page.route(`http://127.0.0.1:${first.port}/**`, (route) => route.continue());
        await page.route(`http://127.0.0.1:${second.port}/**`, (route) => route.continue());
        await seedStorage(page, {
          'swv:ai': storedAi('custom', { customUrl: `http://127.0.0.1:${first.port}/v1` }),
        });
        const dialog = await openAsk(page);
        await dialog.getByRole('button', { name: CHIP }).click();
        await expect(dialog.getByTestId('ask-answer')).toBeVisible();
        await expect(dialog.getByTestId('ask-answer').getByText('Thinking…')).toBeHidden();
        await expect(dialog.getByTestId('ask-answer')).not.toContainText(
          'From the second address.',
        );

        expect(first.hits.map((h) => h.url)).toEqual(['/v1']);
        expect(first.hits[0]?.authorization).toBe(`Bearer ${SENTINEL_KEYS.custom ?? ''}`);
        expect(second.hits).toEqual([]);
        await expectNothingRan(armed, kind);
      } finally {
        await first.stop();
        await second.stop();
      }
    });
  }
});
