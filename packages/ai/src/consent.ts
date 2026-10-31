import { z } from 'zod';

import { endpointUrl, type ModelEntry } from './models.ts';
import { presetFor } from './presets.ts';
import { notifyAiChange, readJson, writeJson } from './storage.ts';

/**
 * Plan section 4: before the first AI feature, say what text goes to which provider. Saved per
 * host, so a model added later on another host is announced too.
 */
const CONSENT_KEY = 'swv:ai:consent';

/** The host a model's text goes to, as the notice names it. */
export function modelHost(entry: ModelEntry): string {
  if (presetFor(entry.preset).artifact) return 'Claude (through this artifact)';
  try {
    return new URL(endpointUrl(entry)).host;
  } catch {
    return endpointUrl(entry);
  }
}

function toldHosts(): string[] {
  const parsed = z.array(z.string()).safeParse(readJson(CONSENT_KEY));
  return parsed.success ? parsed.data : [];
}

/** The models whose host has not been announced yet. */
export function consentMissing(models: readonly ModelEntry[]): ModelEntry[] {
  const told = toldHosts();
  return models.filter((m) => !told.includes(modelHost(m)));
}

/** Records that the person has read the notice for these models. */
export function grantConsent(models: readonly ModelEntry[]): void {
  writeJson(CONSENT_KEY, [...new Set([...toldHosts(), ...models.map(modelHost)])]);
  notifyAiChange();
}
