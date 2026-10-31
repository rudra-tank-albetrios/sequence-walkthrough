// Checks code links against the project they came from. Used by the validator's --root option.
import { readFileSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

import type { CodeLink, ValidationIssue } from '@swv/core';

export interface LinkedCode extends CodeLink {
  /** The lines the link points at, or null when the link is broken. */
  code: string[] | null;
}

const LONGEST_LINE = 200;

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** The file's lines, without the empty one a final line break leaves. */
function fileLines(path: string): string[] {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

function problemWith(link: CodeLink, root: string, read: (path: string) => string[]): string | null {
  const target = resolve(root, link.path);
  const rel = relative(root, target);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return 'points outside the project';
  if (!isFile(target)) return 'no such file in the project';
  const total = read(target).length;
  return link.from < 1 || link.to > total ? `the file has ${total} lines` : null;
}

/** Every link with what it points at, and an issue for each one that points nowhere. */
export function checkLinks(
  links: CodeLink[],
  root: string,
): { issues: ValidationIssue[]; linked: LinkedCode[] } {
  const cache = new Map<string, string[]>();
  const read = (path: string): string[] => {
    const known = cache.get(path);
    if (known) return known;
    const lines = fileLines(path);
    cache.set(path, lines);
    return lines;
  };
  const issues: ValidationIssue[] = [];
  const linked = links.map((link): LinkedCode => {
    const problem = problemWith(link, root, read);
    if (problem) {
      const message = `${link.path}:${link.from}: ${problem}`;
      issues.push({ line: link.line, severity: 'warning', code: 'ref-missing', message });
      return { ...link, code: null };
    }
    const lines = read(resolve(root, link.path)).slice(link.from - 1, link.to);
    return { ...link, code: lines.map((line) => line.trim().slice(0, LONGEST_LINE)) };
  });
  return { issues, linked };
}
