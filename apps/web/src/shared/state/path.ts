import type { Flow, Step } from '@swv/core';

/** Which steps to walk: all, the happy path, the errors, or one `alt` branch. */
export type PathMode = 'all' | 'happy' | 'errors' | `branch:${number}:${string}`;

export interface BranchChoice {
  key: PathMode;
  label: string;
  kind: 'alt' | 'else';
}

export function pathVisible(step: Step, mode: PathMode): boolean {
  if (mode === 'all') return true;
  if (mode === 'happy') return !step.inElse && !step.isError;
  if (mode === 'errors') {
    return step.isError || step.inElse || !step.branch.some((b) => b.kind === 'alt');
  }
  const m = /^branch:(\d+):(.*)$/.exec(mode);
  const id = m?.[1];
  const label = m?.[2] ?? '';
  const entry = step.branch.find((b) => String(b.id) === id);
  return !entry || entry.label === label;
}

/** Every alt / else branch in the flow, for the chooser. */
export function pathBranches(flow: Flow | null): BranchChoice[] {
  const seen = new Map<string, BranchChoice>();
  for (const step of flow?.steps ?? []) {
    for (const b of step.branch) {
      if (b.kind !== 'alt' && b.kind !== 'else') continue;
      const key: PathMode = `branch:${b.id}:${b.label}`;
      if (!seen.has(key)) seen.set(key, { key, label: b.label || '(unnamed branch)', kind: b.kind });
    }
  }
  return [...seen.values()];
}

export function pathLabel(mode: PathMode, flow: Flow | null): string {
  if (mode === 'happy') return 'happy path';
  if (mode === 'errors') return 'errors only';
  const branch = pathBranches(flow).find((b) => b.key === mode);
  return branch ? `${branch.kind} ${branch.label}` : 'all steps';
}

/** The chooser only appears when the flow has branches or error replies. */
export function hasPaths(flow: Flow | null): boolean {
  return pathBranches(flow).length > 0 || (flow?.steps ?? []).some((s) => s.isError);
}
