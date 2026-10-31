// Kept apart from index.ts so a script bundled for the skills (install.mjs) can take listFiles
// without pulling in repoRoot and its import.meta.url.
import { readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';

/** Files under `dir`, as sorted posix paths relative to it. */
export function listFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, resolve(entry.parentPath, entry.name)).replaceAll('\\', '/'))
    .sort();
}
