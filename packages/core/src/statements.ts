/** `#59;` and `#quot;`: the one place a `#` or `;` may appear in a label without ending it. */
export const ENTITY_AT_START = /^#(?:\d+|[a-zA-Z][a-zA-Z0-9]*);/;

/**
 * Mermaid lexes a bare `;` as a line break, so one source line may hold several statements
 * (`A->>B: hi; B-->>A: ok` draws two arrows). Entities keep their semicolon. Returns the trimmed,
 * non-empty statements of a line that is not a `%%` comment.
 */
export function splitStatements(line: string): string[] {
  const out: string[] = [];
  let current = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] ?? '';
    if (ch === '#') {
      const entity = ENTITY_AT_START.exec(line.slice(i));
      if (entity) {
        current += entity[0];
        i += entity[0].length - 1;
        continue;
      }
    }
    if (ch === ';') {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out.map((s) => s.trim()).filter(Boolean);
}
