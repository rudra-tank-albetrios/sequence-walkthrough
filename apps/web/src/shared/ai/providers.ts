/**
 * The model providers Ask AI can call (docs/v2-internals.md section 6), in menu order. The page has
 * no server: a key the person enters stays in this browser and is sent only to that provider's URL.
 * Every provider speaks the OpenAI chat-completions shape, except the Claude artifact capability,
 * which the claude.ai host grants without a key.
 */
export type ProviderId =
  | 'groq'
  | 'gemini'
  | 'openrouter'
  | 'cerebras'
  | 'mistral'
  | 'ollama'
  | 'custom'
  | 'claude';

export interface Provider {
  id: ProviderId;
  name: string;
  /** Chat-completions URL. Empty for `custom` (the settings hold it) and `claude` (no URL). */
  url: string;
  /** Default model; the settings may override it. Empty when the provider has none. */
  model: string;
  /** Whether the key field is shown and whether a key is needed before a question can be sent. */
  key: 'required' | 'optional' | 'none';
  /** Where to get a key. */
  keyPage?: string;
  /** Runs through `window.claude.use('sample')` instead of `fetch`. */
  artifact?: true;
}

const GROQ: Provider = {
  id: 'groq',
  name: 'Groq (free tier)',
  url: 'https://api.groq.com/openai/v1/chat/completions',
  model: 'llama-3.3-70b-versatile',
  key: 'required',
  keyPage: 'https://console.groq.com/keys',
};

export const PROVIDERS: readonly Provider[] = [
  GROQ,
  {
    id: 'gemini',
    name: 'Google Gemini (free tier)',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    model: 'gemini-2.5-flash',
    key: 'required',
    keyPage: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter (free models)',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    key: 'required',
    keyPage: 'https://openrouter.ai/keys',
  },
  {
    id: 'cerebras',
    name: 'Cerebras (free tier)',
    url: 'https://api.cerebras.ai/v1/chat/completions',
    model: 'llama-3.3-70b',
    key: 'required',
    keyPage: 'https://cloud.cerebras.ai',
  },
  {
    id: 'mistral',
    name: 'Mistral (free tier)',
    url: 'https://api.mistral.ai/v1/chat/completions',
    model: 'mistral-small-latest',
    key: 'required',
    keyPage: 'https://console.mistral.ai/api-keys',
  },
  {
    id: 'ollama',
    name: 'Ollama on this computer (no key)',
    url: 'http://localhost:11434/v1/chat/completions',
    model: 'llama3.2',
    key: 'none',
  },
  {
    id: 'custom',
    name: 'Custom OpenAI-compatible endpoint',
    url: '',
    model: '',
    key: 'optional',
  },
  {
    id: 'claude',
    name: 'Claude (only when this page runs as a Claude artifact)',
    url: '',
    model: '',
    key: 'none',
    artifact: true,
  },
];

export const PROVIDER_IDS: readonly ProviderId[] = PROVIDERS.map((p) => p.id);

export const isProviderId = (value: unknown): value is ProviderId =>
  typeof value === 'string' && (PROVIDER_IDS as readonly string[]).includes(value);

/** The provider for an id; an unknown id falls back to Groq, as version 2 did. */
export function providerFor(id: string): Provider {
  return PROVIDERS.find((p) => p.id === id) ?? GROQ;
}

/** `Groq` for `Groq (free tier)`: the name as the panel shows it. */
export const shortName = (p: Provider): string => p.name.split(' (')[0] ?? p.name;

/** The system prompt, verbatim from version 2. */
export const AI_SYSTEM = `You explain one step of a software flow to a developer who is new to this codebase.
Rules: answer in under 60 words. Be as exact as a senior engineer; never invent details about the project.
Use plain words; if you must use a technical term, add two or three words saying what it is.
Give one concrete example when it helps. No greetings, no lists unless asked, no repeating the question.
If the question is about something the context does not cover, say "Not in this diagram:" and then give the general meaning in one sentence.`;
