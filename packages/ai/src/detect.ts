import { z } from 'zod';

import { endpointUrl, urlProblem, type ModelEntry } from './models.ts';
import { PRESETS, type PresetId } from './presets.ts';

/** What a pasted link says: who runs the model, where to call it, and which model it names. */
interface DetectedLink {
  preset: PresetId;
  /** The chat-completions URL, for `custom` only. A preset's URL comes from the preset. */
  url: string;
  name: string;
  /** Empty when the link names no model and the provider has no default. */
  model: string;
  /** The link itself named the model, so nothing may replace it. */
  named: boolean;
  /** The host the key and the questions go to. */
  host: string;
}

export type LinkResult = ({ ok: true } & DetectedLink) | { ok: false; message: string };

const CHAT_PATH = '/chat/completions';
const LIST_TIMEOUT_MS = 10_000;
const MOST_NAMES = 500;
const NOT_CHAT = /embed|whisper|tts|guard|moderation|image|imagen|veo|aqa|transcribe/i;
const GEMINI_VERB = /:(stream)?generateContent$/i;

/** Provider web pages people copy links from, beside the API hosts in `PRESETS`. */
const WEB_HOSTS: Readonly<Record<string, PresetId>> = {
  'groq.com': 'groq',
  'console.groq.com': 'groq',
  'aistudio.google.com': 'gemini',
  'ai.google.dev': 'gemini',
  'cloud.cerebras.ai': 'cerebras',
  'inference.cerebras.ai': 'cerebras',
  'console.mistral.ai': 'mistral',
  'mistral.ai': 'mistral',
};

function presetOfHost(url: URL): PresetId | null {
  const host = url.hostname.replace(/^www\./, '');
  const web = WEB_HOSTS[host];
  if (web) return web;
  const found = PRESETS.find((p) => p.url && new URL(p.url).host === url.host.replace(/^www\./, ''));
  return found ? found.id : null;
}

/** The model a link names: `?model=`, `/models/<id>`, or OpenRouter's and Hugging Face's `/org/name` pages. */
function modelInLink(url: URL, preset: PresetId | null): string {
  const query = url.searchParams.get('model');
  if (query) return query;
  const path = decodeURIComponent(url.pathname).replace(/\/+$/, '');
  const named = /\/models\/(.+)$/.exec(path)?.[1];
  if (named) return named.replace(GEMINI_VERB, '');
  const isModelPage = preset === 'openrouter' || url.hostname.endsWith('huggingface.co');
  const parts = path.split('/').filter(Boolean);
  return isModelPage && parts.length === 2 && parts[0] !== 'api' ? parts.join('/') : '';
}

/** Any path of an OpenAI-compatible server, as its chat-completions address. */
function chatEndpoint(url: URL): string {
  const path = decodeURIComponent(url.pathname)
    .replace(/\/+$/, '')
    .replace(/\/models(\/.*)?$/, '');
  if (path.endsWith(CHAT_PATH)) return `${url.origin}${path}`;
  return `${url.origin}${path || '/v1'}${CHAT_PATH}`;
}

/** `api.deepseek.com` to `Deepseek`, for the name a new entry starts with. */
function nameOfHost(hostname: string): string {
  if (hostname === 'localhost' || hostname === '127.0.0.1') return 'Local model';
  const label = hostname.replace(/^(api|www|router|inference)\./, '').split('.')[0] ?? hostname;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * `detectModelLink(link: string): LinkResult`
 *
 * Works out everything a pasted link can say: the provider, the address to call and the model, from
 * an API address, a provider's web page or a bare host. It only reads the text and sends nothing. A
 * link carrying a key or a password is refused, so a key never ends up saved as an address.
 */
export function detectModelLink(link: string): LinkResult {
  const text = link.trim();
  if (!text) return { ok: false, message: 'Paste a link first.' };
  const local = /^(localhost|127\.0\.0\.1)([:/]|$)/.test(text);
  const full = /^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `${local ? 'http' : 'https'}://${text}`;
  const problem = urlProblem(full);
  if (problem) return { ok: false, message: problem };
  const url = new URL(full);

  if (url.hostname.endsWith('huggingface.co') && !url.hostname.startsWith('router.')) {
    return {
      ok: true,
      preset: 'custom',
      url: `https://router.huggingface.co/v1${CHAT_PATH}`,
      name: 'Hugging Face',
      model: modelInLink(url, null),
      named: modelInLink(url, null) !== '',
      host: 'router.huggingface.co',
    };
  }

  const preset = presetOfHost(url);
  const known = PRESETS.find((p) => p.id === preset);
  if (known) {
    return {
      ok: true,
      preset: known.id,
      url: '',
      name: known.name,
      model: modelInLink(url, known.id) || known.model,
      named: modelInLink(url, known.id) !== '',
      host: new URL(known.url).host,
    };
  }
  return {
    ok: true,
    preset: 'custom',
    url: chatEndpoint(url),
    name: nameOfHost(url.hostname),
    model: modelInLink(url, null),
    named: modelInLink(url, null) !== '',
    host: url.host,
  };
}

/** The model to start with when the link named none: the current one if offered, then a free one. */
export function chooseModel(names: readonly string[], current: string): string {
  if (names.includes(current)) return current;
  return names.find((name) => name.endsWith(':free')) ?? names[0] ?? current;
}

const ModelList = z.object({ data: z.array(z.object({ id: z.string().min(1) })) });

/**
 * `listModelNames(entry: ModelEntry): Promise<string[] | null>`
 *
 * Asks the entry's own server which models it offers, sending the key only to that address, with no
 * redirects. Null when it will not say, which many servers do without a key or to browsers. Never throws.
 */
export async function listModelNames(entry: ModelEntry): Promise<string[] | null> {
  const endpoint = endpointUrl(entry);
  if (!endpoint.endsWith(CHAT_PATH)) return null;
  try {
    const reply = await fetch(`${endpoint.slice(0, -CHAT_PATH.length)}/models`, {
      headers: entry.key ? { Authorization: `Bearer ${entry.key}` } : {},
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(LIST_TIMEOUT_MS),
    });
    if (!reply.ok) return null;
    const list = ModelList.safeParse(await reply.json());
    if (!list.success) return null;
    const names = list.data.data.map((m) => m.id.replace(/^models\//, '')).filter((id) => !NOT_CHAT.test(id));
    return names.slice(0, MOST_NAMES);
  } catch {
    return null;
  }
}
