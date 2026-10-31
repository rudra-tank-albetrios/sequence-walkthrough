import { Store } from '../../shared/storage/store.ts';

/**
 * The recap's one link to the user's model. Until `@swv/ai` (phase 6) lands, it reads the provider
 * settings Ask AI saves and sends one OpenAI-compatible request. The key goes only to that URL.
 */
const PROVIDERS: Readonly<Record<string, { name: string; url: string; model: string }>> = {
  groq: {
    name: 'Groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile',
  },
};

export interface RecapRequest {
  system: string;
  user: string;
  maxTokens: number;
  signal: AbortSignal;
}

export interface RecapModel {
  name: string;
  send: (request: RecapRequest) => Promise<string>;
}

interface StoredAi {
  provider?: string;
  keys?: Record<string, string>;
  models?: Record<string, string>;
}

/** The model the user set up, or null when there is none. */
export function recapModel(): RecapModel | null {
  const stored = Store.get<StoredAi>('swv:ai', {});
  const id = stored.provider ?? 'groq';
  const provider = PROVIDERS[id];
  const key = stored.keys?.[id];
  if (!provider || !key) return null;
  const model = stored.models?.[id] ?? provider.model;
  return {
    name: `${provider.name} · ${model}`,
    send: async ({ system, user, maxTokens, signal }) => {
      const response = await fetch(provider.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0.2,
          max_tokens: maxTokens,
        }),
        signal,
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const body = (await response.json()) as {
        choices?: { message?: { content?: unknown } }[];
      };
      const text = body.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || !text) throw new Error('The model sent no answer text');
      return text;
    },
  };
}
