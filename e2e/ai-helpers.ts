import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

export const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
export const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
export const MISTRAL_URL = 'https://api.mistral.ai/v1/chat/completions';

const A11Y_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

export async function openDemo(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('diagram').locator('svg').first()).toBeVisible({ timeout: 30_000 });
}

/** ArrowRight moves from the overview to step 1; `A` opens the Ask panel for it. */
export async function openAskOnStep1(page: Page) {
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('a');
  const dialog = page.getByRole('dialog', { name: 'Ask AI about step 1' });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Ask panel on step 1, then AI settings over it. */
export async function openSettings(page: Page) {
  const ask = await openAskOnStep1(page);
  await ask.getByTitle('Models, keys and limits').click();
  const settings = page.getByRole('dialog', { name: 'AI settings', exact: true });
  await expect(settings).toBeVisible();
  return settings;
}

export async function expectAccessibleDialog(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(A11Y_TAGS)
    .include('[role="dialog"]')
    .analyze();
  expect(results.violations).toEqual([]);
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, http-referer, x-title',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers':
    'retry-after, x-ratelimit-limit-requests, x-ratelimit-remaining-requests, x-ratelimit-reset-requests',
};

export interface ProviderReply {
  answer?: string;
  status?: number;
  headers?: Record<string, string>;
  /** A raw body, instead of `answer`. */
  body?: string;
  /** Fail the way a lost connection does. */
  abort?: boolean;
}

export interface SentCall {
  authorization: string;
  body: { max_tokens: number; messages: { role: string; content: string }[] };
}

/** Answers one provider URL and records what the page sent it. No real provider is ever reached. */
export async function mockProvider(
  page: Page,
  url: string,
  reply: ProviderReply | (() => ProviderReply),
) {
  const sent: SentCall[] = [];
  await page.route(url, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    sent.push({
      authorization: route.request().headers().authorization ?? '',
      body: JSON.parse(route.request().postData() ?? '{}') as SentCall['body'],
    });
    const {
      answer = 'OK',
      status = 200,
      headers = {},
      body,
      abort = false,
    } = typeof reply === 'function' ? reply() : reply;
    if (abort) {
      await route.abort('failed');
      return;
    }
    await route.fulfill({
      status,
      headers: { ...CORS, 'Content-Type': 'application/json', ...headers },
      body: body ?? JSON.stringify({ choices: [{ message: { content: answer } }] }),
    });
  });
  return sent;
}

/** Puts this in localStorage once, before the page starts. A reload keeps what the page changed. */
export async function seedStorage(page: Page, items: Record<string, unknown>) {
  await page.addInitScript((data) => {
    if (sessionStorage.getItem('e2e-seeded')) return;
    sessionStorage.setItem('e2e-seeded', '1');
    for (const [key, value] of Object.entries(data))
      localStorage.setItem(key, JSON.stringify(value));
  }, items);
}

const PRESETS = {
  groq: { name: 'Groq', model: 'llama-3.3-70b-versatile', key: 'groq-key' },
  gemini: { name: 'Gemini', model: 'gemini-2.5-flash', key: 'gemini-key' },
  mistral: { name: 'Mistral', model: 'mistral-small-latest', key: 'mistral-key' },
};

export const HOSTS = ['api.groq.com', 'generativelanguage.googleapis.com', 'api.mistral.ai'];

export interface SeedModel {
  preset: keyof typeof PRESETS;
  fallback?: boolean;
  limits?: { requestsPerDay?: number | null; tokensPerDay?: number | null };
}

/** The storage of a person who has these models, the first one asked first, and has read the notice. */
export function modelStorage(models: readonly SeedModel[], extra: Record<string, unknown> = {}) {
  return {
    'swv:ai:models': {
      models: models.map(({ preset, fallback = false, limits = {} }) => ({
        id: preset,
        preset,
        url: '',
        fallback,
        limits,
        ...PRESETS[preset],
      })),
      activeId: models[0]?.preset ?? '',
      switchAt: 5,
      forgetKeys: false,
    },
    'swv:ai:consent': HOSTS,
    ...extra,
  };
}

/** Every request the page makes that carries a key, as `key at url`. */
export function keyLog(page: Page) {
  const log = new Set<string>();
  page.on('request', (request) => {
    const authorization = request.headers().authorization;
    if (authorization) log.add(`${authorization.replace('Bearer ', '')} at ${request.url()}`);
  });
  return log;
}
