import type { Flow } from '@swv/core';
import { useEffect } from 'react';

import { useFlowStore } from '../../shared/state/flowStore.ts';
import { hasPaths, pathBranches, type BranchChoice, type PathMode } from '../../shared/state/path.ts';
import styles from './walkbar.module.css';

function toPathMode(value: string, branches: BranchChoice[]): PathMode {
  if (value === 'happy' || value === 'errors') return value;
  return branches.find((b) => b.key === value)?.key ?? 'all';
}

/** Which steps to walk: all, the happy path, the errors, or one branch. Hidden without branches. */
export function PathSelect({ flow }: { flow: Flow }) {
  const path = useFlowStore((s) => s.path);
  const setPath = useFlowStore((s) => s.setPath);
  const show = hasPaths(flow);
  const branches = pathBranches(flow);
  const value = toPathMode(path, branches);

  // A filter from a previous flow that this one cannot express goes back to "all".
  useEffect(() => {
    if ((!show || value !== path) && path !== 'all') setPath('all');
  }, [show, value, path, setPath]);

  if (!show) return null;
  return (
    <select
      className={styles.pathSel}
      aria-label="Which path to walk"
      title="Walk every step, the happy path only, the errors only, or one branch"
      value={value}
      data-testid="path-select"
      onChange={(e) => {
        setPath(toPathMode(e.target.value, branches));
      }}
    >
      <option value="all">Path: all steps</option>
      <option value="happy">Happy path only</option>
      <option value="errors">Errors only</option>
      {branches.length > 0 ? (
        <optgroup label="One branch">
          {branches.map((b) => (
            <option key={b.key} value={b.key}>
              {b.kind} {b.label}
            </option>
          ))}
        </optgroup>
      ) : null}
    </select>
  );
}
