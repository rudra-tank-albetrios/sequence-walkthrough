import type { Route } from '@playwright/test';

import type { Armed } from './armed.ts';

/** A mocked model provider for the security specs. No real key or service is ever used. */

export const PROVIDER_URLS = {
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  cerebras: 'https://api.cerebras.ai/v1/chat/completions',
  mistral: 'https://api.mistral.ai/v1/chat/completions',
  ollama: 'http://localhost:11434/v1/chat/completions',
  custom: 'https://models.good.example/v1/chat/completions',
} as const;

export type HttpProvider = keyof typeof PROVIDER_URLS;

export const HTTP_PROVIDERS = Object.keys(PROVIDER_URLS) as HttpProvider[];

/** A made-up key per provider. Finding one of these anywhere it should not be is a failure. */
export const SENTINEL_KEYS: Record<string, string> = {
  groq: 'SENTINEL-groq-7f3a9c',
  gemini: 'SENTINEL-gemini-c41d07',
  openrouter: 'SENTINEL-openrouter-5be2d1',
  cerebras: 'SENTINEL-cerebras-90aa4f',
  mistral: 'SENTINEL-mistral-3e77b8',
  custom: 'SENTINEL-custom-d2c618',
};

export const ALL_SENTINELS = Object.values(SENTINEL_KEYS);

/** What `swv:ai` holds after an earlier visit, as JSON text. */
export function storedAi(
  provider: string,
  more: { keys?: Record<string, unknown>; customUrl?: string; autoNote?: boolean } = {},
): string {
  return JSON.stringify({
    provider,
    keys: more.keys ?? SENTINEL_KEYS,
    models: {},
    customUrl: more.customUrl ?? PROVIDER_URLS.custom,
    includePayload: true,
    autoNote: more.autoNote ?? true,
    mode: 'project',
  });
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, http-referer, x-title',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export interface ModelReply {
  status?: number;
  contentType?: string;
  /** The response body as it goes on the wire. */
  body: string;
}

/** The body a provider sends for an ordinary answer. */
export const answerBody = (content: unknown, more: Record<string, unknown> = {}): string =>
  JSON.stringify({ choices: [{ message: { content, ...more } }] });

/** Answers one address with a fixed reply. It takes over from the refusal `arm` installed. */
export async function mockModel(
  armed: Armed,
  url: string,
  reply: ModelReply | string,
): Promise<void> {
  const { status = 200, contentType = 'application/json', body } =
    typeof reply === 'string' ? { body: answerBody(reply) } : reply;
  const handler = async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    await route.fulfill({ status, headers: { ...CORS, 'Content-Type': contentType }, body });
  };
  await armed.page.route(url, handler);
}

/** The POST requests the page sent to one address. */
export const postsTo = (armed: Armed, url: string) =>
  armed.requests.filter((r) => r.url === url && r.method === 'POST');

/** The POST requests that went to any model address. */
export const modelPosts = (armed: Armed) =>
  armed.requests.filter(
    (r) => r.method === 'POST' && (Object.values(PROVIDER_URLS) as string[]).includes(r.url),
  );
