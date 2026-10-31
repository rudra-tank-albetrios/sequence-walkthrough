import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface Ran {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Runs a built script in a Node of its own, the way a skill or a person does. */
export function runScript(
  script: string,
  args: string[],
  options: { input?: string; env?: Record<string, string>; cwd?: string } = {},
): Ran {
  const { status, stdout, stderr } = spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    input: options.input ?? '',
    env: { ...process.env, ...options.env },
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
  });
  return { status, stdout, stderr };
}

const made: string[] = [];

export function tempFolder(prefix: string): string {
  const folder = mkdtempSync(join(tmpdir(), `swv-${prefix}-`));
  made.push(folder);
  return folder;
}

export function removeTempFolders(): void {
  for (const folder of made.splice(0)) rmSync(folder, { recursive: true, force: true });
}
