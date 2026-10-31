import { skipFrontMatter } from '@swv/core';

/**
 * Mermaid strips front matter, comment lines and the blank lines just above a comment before
 * parsing, so the line numbers in its errors skip them. Maps Mermaid's line `n` (1-based) back to
 * the index of the line in the code the user sees.
 */
export function mermaidLineToCode(code: string, n: number): number {
  const lines = code.replace(/\r\n?/g, '\n').split('\n');
  const start = skipFrontMatter(lines);
  const removed = new Set<number>();
  for (let j = start; j < lines.length; j++) {
    if (!/^\s*%%(?!\{)./.test(lines[j] ?? '')) continue;
    removed.add(j);
    for (let b = j - 1; b >= start && !lines[b]?.trim() && !removed.has(b); b--) removed.add(b);
  }
  const kept: number[] = [];
  for (let j = start; j < lines.length; j++) if (!removed.has(j)) kept.push(j);
  const blank = (l: string) => !l.trim() || /^\s*%%\{.*\}%%\s*$/.test(l);
  while (kept.length && blank(lines[kept[0] ?? 0] ?? '')) kept.shift();
  return kept[n - 1] ?? lines.length - 1;
}

/** The source line of a Mermaid parse error message, or null when it names none. */
export function errorLine(code: string, message: string): number | null {
  const m = /Parse error on line (\d+)/.exec(message);
  return m?.[1] ? mermaidLineToCode(code, Number(m[1])) : null;
}
