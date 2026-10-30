import type { DataTouched, Payload, Step } from './types.ts';
import { PART_LABEL } from './vocabulary.ts';

/** One plain-text payload for Find, exports and version 1 code paths. */
export function joinPayloads(payloads: Payload[]): string {
  return payloads
    .map((p) => (p.part === '_' ? p.text : `${PART_LABEL[p.part]}: ${p.text}`))
    .join('\n')
    .trim();
}

/** Tables and operations read out of SQL payloads and SQL-looking labels. */
export function dataTouched(steps: Step[]): DataTouched[] {
  const map = new Map<string, { table: string; ops: Set<string>; steps: Set<number> }>();
  const add = (table: string, op: string, idx: number) => {
    const name = table.replace(/^["'`]|["'`]$/g, '');
    const key = name.toLowerCase();
    const entry = map.get(key) ?? { table: name, ops: new Set<string>(), steps: new Set<number>() };
    entry.ops.add(op);
    entry.steps.add(idx);
    map.set(key, entry);
  };
  for (const step of steps) {
    const texts = [
      ...step.payloads.filter((p) => p.part === 'sql' || p.part === '_').map((p) => p.text),
      step.label.join(' '),
    ];
    for (const text of texts) {
      const op = /\b(SELECT|INSERT|UPDATE|DELETE|UPSERT|MERGE)\b/i.exec(text)?.[1];
      if (!op) continue;
      for (const m of text.matchAll(/\b(?:FROM|INTO|UPDATE|JOIN)\s+([A-Za-z_][\w.]*)/gi)) {
        const table = m[1] ?? '';
        if (/^(SELECT|SET|WHERE|VALUES)$/i.test(table)) continue;
        add(table, op.toUpperCase(), step.idx);
      }
    }
  }
  return [...map.values()]
    .map((e) => ({ table: e.table, ops: [...e.ops], steps: [...e.steps] }))
    .sort((a, b) => a.table.localeCompare(b.table));
}

export interface PayloadDiff {
  added: string[];
  removed: string[];
  changed: string[];
}

function parseObject(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text.trim());
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Added, removed and changed top-level fields between two JSON-looking payload bodies. */
export function payloadDiff(fromText: string, toText: string): PayloadDiff | null {
  const a = parseObject(fromText);
  const b = parseObject(toText);
  if (!a || !b) return null;
  return {
    added: Object.keys(b).filter((k) => !(k in a)),
    removed: Object.keys(a).filter((k) => !(k in b)),
    changed: Object.keys(b).filter((k) => k in a && JSON.stringify(a[k]) !== JSON.stringify(b[k])),
  };
}

/** The body-like payload text of a step: the body part, else the first JSON-looking part. */
export function bodyText(step: Step): string {
  const body = step.payloads.find((p) => p.part === 'body');
  if (body) return body.text;
  return step.payloads.find((p) => /^\s*\{/.test(p.text))?.text ?? '';
}
