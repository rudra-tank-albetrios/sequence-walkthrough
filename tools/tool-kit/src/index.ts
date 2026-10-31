import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export { listFiles } from './files.ts';

/** The repository root, found from this file's location. */
export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** The config files are ours, so an array is trusted to hold the declared item type. */
function isList<T>(value: unknown): value is T[] {
  return Array.isArray(value);
}

/** Reads a JSON config file of the shape `{ [key]: T[] }`. */
export function readJsonList<T>(file: string, key: string): T[] {
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || !(key in parsed)) {
    throw new Error(`${file} must be an object with a "${key}" array`);
  }
  const list: unknown = (parsed as Record<string, unknown>)[key];
  if (!isList<T>(list)) throw new Error(`${file}: "${key}" must be an array`);
  return list;
}
