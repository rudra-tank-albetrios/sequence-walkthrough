/**
 * The ready-made model entries, in menu order. Every one speaks the OpenAI chat-completions shape,
 * except `claude`, which the claude.ai artifact host grants without a key. `docs/decisions.md`
 * records what each provider allowed when checked from a browser's point of view.
 */
export type PresetId =
  | 'groq'
  | 'gemini'
  | 'openrouter'
  | 'cerebras'
  | 'mistral'
  | 'ollama'
  | 'custom'
  | 'claude';

export interface Preset {
  id: PresetId;
  /** The name in the provider menu. */
  label: string;
  /** The name a new entry starts with. */
  name: string;
  /** Chat-completions URL. Empty for `custom` (the entry holds it) and `claude` (no URL). */
  url: string;
  /** Default model name. Empty when the preset has none. */
  model: string;
  key: 'required' | 'optional' | 'none';
  /** Where to get a key. */
  keyPage?: string;
  /** OpenRouter's key information endpoint, read for the exact usage. */
  keyInfoUrl?: string;
  /** A bad key's error reply carries no CORS header, so a browser sees only a failed call. */
  hidesBadKey?: true;
  /** Runs through `window.claude.use('sample')` instead of `fetch`. */
  artifact?: true;
}

export const PRESETS: readonly Preset[] = [
  {
    id: 'groq',
    label: 'Groq (free tier)',
    name: 'Groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile',
    key: 'required',
    keyPage: 'https://console.groq.com/keys',
  },
  {
    id: 'gemini',
    label: 'Google Gemini (free tier)',
    name: 'Gemini',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    model: 'gemini-2.5-flash',
    key: 'required',
    keyPage: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter (free models)',
    name: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    key: 'required',
    keyPage: 'https://openrouter.ai/keys',
    keyInfoUrl: 'https://openrouter.ai/api/v1/key',
  },
  {
    id: 'cerebras',
    label: 'Cerebras (free tier)',
    name: 'Cerebras',
    url: 'https://api.cerebras.ai/v1/chat/completions',
    model: 'llama-3.3-70b',
    key: 'required',
    keyPage: 'https://cloud.cerebras.ai',
    hidesBadKey: true,
  },
  {
    id: 'mistral',
    label: 'Mistral (free tier)',
    name: 'Mistral',
    url: 'https://api.mistral.ai/v1/chat/completions',
    model: 'mistral-small-latest',
    key: 'required',
    keyPage: 'https://console.mistral.ai/api-keys',
  },
  {
    id: 'ollama',
    label: 'Ollama on this computer (no key)',
    name: 'Ollama',
    url: 'http://localhost:11434/v1/chat/completions',
    model: 'llama3.2',
    key: 'none',
  },
  {
    id: 'custom',
    label: 'Your own model link (OpenAI-compatible)',
    name: 'My model',
    url: '',
    model: '',
    key: 'optional',
  },
  {
    id: 'claude',
    label: 'Claude (only when this page runs as a Claude artifact)',
    name: 'Claude',
    url: '',
    model: 'quick',
    key: 'none',
    artifact: true,
  },
];

export const isPresetId = (value: unknown): value is PresetId =>
  PRESETS.some((p) => p.id === value);

const CUSTOM_LINK: Preset = {
  id: 'custom',
  label: '',
  name: '',
  url: '',
  model: '',
  key: 'optional',
};

/** The preset for an id. */
export const presetFor = (id: PresetId): Preset =>
  PRESETS.find((p) => p.id === id) ?? CUSTOM_LINK;
