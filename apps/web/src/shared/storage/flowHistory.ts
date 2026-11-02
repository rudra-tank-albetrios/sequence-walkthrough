import { hashStr, type Flow } from '@swv/core';

import { DEFAULT_DIAGRAM } from '../lib/defaultDiagram.ts';
import { flowId } from './notes.ts';
import { Store } from './store.ts';

/**
 * The flows this browser has shown, kept so a quiz can connect them. Only the person's own flows
 * are kept, never the demo, and each flow only once: a new version of a flow replaces the old one,
 * and so does the same flow under another name. Listed and cleared under Stored data.
 */
export const FLOWS_KEY = 'swv:flows';

const MAX_FLOWS = 8;
/** All of them together, so this list can never fill the browser's storage. */
const MAX_CHARS = 200_000;

export interface KeptFlow {
  id: string;
  /** The same steps give the same value, whatever the flow is called. */
  fingerprint: string;
  title: string;
  steps: number;
  savedAt: number;
  code: string;
}

const fingerprintOf = (flow: Flow): string => hashStr(flow.steps.map((step) => step.key).join('\n'));

function toKept(value: unknown): KeptFlow | null {
  if (typeof value !== 'object' || value === null) return null;
  const { id, fingerprint, title, steps, savedAt, code } = value as Record<string, unknown>;
  return typeof id === 'string' &&
    typeof fingerprint === 'string' &&
    typeof title === 'string' &&
    typeof steps === 'number' &&
    typeof savedAt === 'number' &&
    typeof code === 'string'
    ? { id, fingerprint, title, steps, savedAt, code }
    : null;
}

/** Newest first. What storage holds is untrusted, so anything else in it is left out. */
export function keptFlows(): KeptFlow[] {
  const stored = Store.get<unknown>(FLOWS_KEY, []);
  if (!Array.isArray(stored)) return [];
  return stored.flatMap((value: unknown) => {
    const kept = toKept(value);
    return kept ? [kept] : [];
  });
}

export function rememberFlow(flow: Flow, code: string): void {
  const usable = flow.isSequence && flow.steps.length > 0 && code.length <= MAX_CHARS;
  if (!usable || code.trim() === DEFAULT_DIAGRAM.trim()) return;
  const id = flowId(flow);
  const fingerprint = fingerprintOf(flow);
  const kept = keptFlows();
  if (kept[0]?.id === id && kept[0].code === code) return;
  const next: KeptFlow[] = [
    { id, fingerprint, title: flow.title, steps: flow.steps.length, savedAt: Date.now(), code },
    ...kept.filter((old) => old.id !== id && old.fingerprint !== fingerprint),
  ].slice(0, MAX_FLOWS);
  while (next.length > 1 && JSON.stringify(next).length > MAX_CHARS) next.pop();
  Store.set(FLOWS_KEY, next);
}

/** The kept flows that are not this flow, under any name or version. */
export function otherFlows(flow: Flow): KeptFlow[] {
  const id = flowId(flow);
  const fingerprint = fingerprintOf(flow);
  return keptFlows().filter((kept) => kept.id !== id && kept.fingerprint !== fingerprint);
}

export function forgetFlow(id: string): void {
  Store.set(
    FLOWS_KEY,
    keptFlows().filter((kept) => kept.id !== id),
  );
}
