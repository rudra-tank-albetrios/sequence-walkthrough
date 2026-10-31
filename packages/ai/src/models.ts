import { z } from 'zod';

import { isPresetId, PRESETS, presetFor, type PresetId } from './presets.ts';
import { notifyAiChange, readJson, removeKey, writeJson } from './storage.ts';

/** Limits the person typed in, used when a provider gives no usage data. */
export interface ModelLimits {
  requestsPerDay: number | null;
  tokensPerDay: number | null;
}

/** One saved model (plan section 8.1). The list is ordered, and the order decides who is next. */
export interface ModelEntry {
  id: string;
  name: string;
  preset: PresetId;
  /** The endpoint URL, for `custom` only. A preset's URL always comes from the preset. */
  url: string;
  model: string;
  /** The person's own key. Empty when none is held in this browser. */
  key: string;
  limits: ModelLimits;
  /** May auto-switch send questions here? Never true unless the person chose it. */
  fallback: boolean;
}

export interface ModelState {
  models: ModelEntry[];
  /** The model questions go to first. */
  activeId: string;
  /** Remaining usage, in percent, at or below which the next model takes over. */
  switchAt: number;
  /** Keys stay in this tab's sessionStorage and leave with the tab. */
  forgetKeys: boolean;
}

/** The ordered list. Keys are held here, unless `forgetKeys` moves them to `TAB_KEYS`. */
const MODELS_KEY = 'swv:ai:models';
const TAB_KEYS = 'swv:ai:tab-keys';
/** Ask AI's settings, in version 2's shape. Read here, owned there. */
const V2_KEY = 'swv:ai';
const V2_MODEL_FIELDS = ['provider', 'keys', 'models', 'customUrl'] as const;
/** Entries read from `swv:ai` carry this prefix and are never saved. */
const V2_ID_PREFIX = 'ask-ai-';

export const DEFAULT_SWITCH_AT = 5;

const presetIds = PRESETS.map((p) => p.id) as [PresetId, ...PresetId[]];
const optionalLimit = z.number().positive().nullable().catch(null).default(null);

const StoredModel = z.object({
  id: z.string().min(1),
  name: z.string(),
  preset: z.enum(presetIds),
  url: z.string().catch('').default(''),
  model: z.string().catch('').default(''),
  key: z.string().catch('').default(''),
  limits: z
    .object({ requestsPerDay: optionalLimit, tokensPerDay: optionalLimit })
    .catch({ requestsPerDay: null, tokensPerDay: null })
    .default({ requestsPerDay: null, tokensPerDay: null }),
  fallback: z.boolean().catch(false).default(false),
});

const StoredState = z.object({
  models: z.array(z.unknown()).catch([]).default([]),
  activeId: z.string().catch('').default(''),
  switchAt: z.number().min(0).max(100).catch(DEFAULT_SWITCH_AT).default(DEFAULT_SWITCH_AT),
  forgetKeys: z.boolean().catch(false).default(false),
});

const StringMap = z.record(z.string(), z.string());

function readStringMap(value: unknown): Record<string, string> {
  const parsed = StringMap.safeParse(value);
  return parsed.success ? parsed.data : {};
}

const newId = (): string =>
  `m-${Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('')}`;

/** A fresh entry for a preset, with its default name and model. Not yet saved. */
export function newModel(preset: PresetId): ModelEntry {
  const { name, model } = presetFor(preset);
  return {
    id: newId(),
    name,
    preset,
    url: '',
    model,
    key: '',
    limits: { requestsPerDay: null, tokensPerDay: null },
    fallback: false,
  };
}

/** Where this entry's requests and its key go. */
export const endpointUrl = (entry: ModelEntry): string =>
  entry.preset === 'custom' ? entry.url.trim() : presetFor(entry.preset).url;

const SECRET_QUERY = /key|token|secret|password|auth/i;

/**
 * `https` only, except this computer (plan section 4). A key may not travel inside the link.
 * Returns the problem in a sentence, or null when the link is acceptable.
 */
export function urlProblem(raw: string): string | null {
  const text = raw.trim();
  if (!text) return 'Add the link to your model first.';
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return 'The model link is not a valid URL.';
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    return 'The model link must start with https:// (http:// is allowed only for localhost or 127.0.0.1).';
  }
  if (url.username || url.password || [...url.searchParams.keys()].some((name) => SECRET_QUERY.test(name))) {
    return 'Put the key in the API key field, not in the link.';
  }
  return null;
}

/** Whether the Claude artifact host exposes its `use` capability on this page. */
export function hasClaudeHost(): boolean {
  const host = (globalThis as { claude?: unknown }).claude;
  return typeof host === 'object' && host !== null && 'use' in host && typeof host.use === 'function';
}

/** Why this entry cannot be asked right now, in a sentence, or null when it can. */
export function modelProblem(entry: ModelEntry): string | null {
  const preset = presetFor(entry.preset);
  if (preset.artifact) {
    return hasClaudeHost() ? null : `${entry.name} works only when this page runs as a Claude artifact.`;
  }
  const problem = urlProblem(endpointUrl(entry));
  if (problem) return problem;
  return preset.key === 'required' && !entry.key ? `Add the API key for ${entry.name}.` : null;
}

/**
 * Keeps an edit honest: a key is never sent to a different URL than it was saved for. When the
 * URL changes and the key was not typed again, the key is dropped.
 */
export function applyEdit(previous: ModelEntry, next: ModelEntry): ModelEntry {
  const moved = endpointUrl(previous) !== endpointUrl(next) && next.key === previous.key;
  return moved ? { ...next, key: '' } : next;
}

/**
 * Ask AI's provider and keys (`swv:ai`, the shape version 2 wrote) as model entries. The model
 * list screen of plan section 8.1 was not built, so that dialog is the only place a key is typed:
 * it is read on every load and never written, so a key removed there is gone here at once. The
 * ids are fixed per preset, so usage stays attached, and nothing here is saved to the list.
 */
function askAiEntries(): { models: ModelEntry[]; chosenId: string } {
  const v2 = readJson(V2_KEY);
  if (typeof v2 !== 'object' || v2 === null) return { models: [], chosenId: '' };
  const fields = v2 as Record<string, unknown>;
  if (!V2_MODEL_FIELDS.some((field) => field in fields)) return { models: [], chosenId: '' };

  const keys = readStringMap(fields.keys);
  const overrides = readStringMap(fields.models);
  const customUrl = typeof fields.customUrl === 'string' ? fields.customUrl.trim() : '';
  const chosen = isPresetId(fields.provider) ? fields.provider : null;
  const wanted = (id: PresetId): boolean =>
    Boolean(keys[id]) ||
    (id === chosen && (presetFor(id).key === 'none' || (id === 'custom' && customUrl !== '')));
  const order = [...PRESETS.filter((p) => p.id === chosen), ...PRESETS.filter((p) => p.id !== chosen)];

  const models: ModelEntry[] = [];
  for (const { id } of order) {
    if (!wanted(id)) continue;
    const entry = { ...newModel(id), id: V2_ID_PREFIX + id, url: id === 'custom' ? customUrl : '', key: (keys[id] ?? '').trim() };
    const override = overrides[id]?.trim();
    if (override) entry.model = override;
    models.push(entry);
  }
  const first = models[0];
  return { models, chosenId: first?.preset === chosen ? first.id : '' };
}

const isAskAiEntry = (entry: ModelEntry): boolean => entry.id.startsWith(V2_ID_PREFIX);

/**
 * `loadModelState(): ModelState`
 *
 * The saved list with its keys, plus Ask AI's provider and key as read from `swv:ai` right now.
 * Reads storage every time, so several tabs and later features stay in step. Ask AI's chosen
 * provider is the active model unless the saved list names one.
 */
export function loadModelState(): ModelState {
  const parsed = StoredState.safeParse(readJson(MODELS_KEY) ?? {});
  const stored = parsed.success ? parsed.data : StoredState.parse({});
  const tabKeys = readStringMap(readJson(TAB_KEYS, 'session'));
  const saved = stored.models.flatMap((raw) => {
    const entry = StoredModel.safeParse(raw);
    if (!entry.success || isAskAiEntry(entry.data)) return [];
    return [{ ...entry.data, key: tabKeys[entry.data.id] ?? entry.data.key }];
  });
  const askAi = askAiEntries();
  const models = [...saved, ...askAi.models];
  const activeId = models.some((m) => m.id === stored.activeId)
    ? stored.activeId
    : askAi.chosenId || (models[0]?.id ?? '');
  return { ...stored, models, activeId };
}

/**
 * Saves the list. With `forgetKeys`, the keys go to this tab only and leave localStorage. Ask AI's
 * entries are left out: their key lives in `swv:ai` and nowhere else.
 */
export function saveModelState(state: ModelState): void {
  const { forgetKeys } = state;
  const own = state.models.filter((m) => !isAskAiEntry(m));
  writeJson(MODELS_KEY, { ...state, models: own.map((m) => (forgetKeys ? { ...m, key: '' } : m)) });
  if (forgetKeys) {
    const held = own.filter((m) => m.key).map((m) => [m.id, m.key] as const);
    writeJson(TAB_KEYS, Object.fromEntries(held), 'session');
  } else {
    removeKey(TAB_KEYS, 'session');
  }
  notifyAiChange();
}

/**
 * `hasUsableModel(): boolean`
 *
 * True when at least one saved model can be asked now. A feature with a no-model mode checks this
 * first; `callModel` also answers with the typed error `no-model`.
 */
export function hasUsableModel(): boolean {
  return loadModelState().models.some((m) => modelProblem(m) === null);
}
