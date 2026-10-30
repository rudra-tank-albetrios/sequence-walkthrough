import { STOPWORDS } from './vocabulary.ts';

/** Named entities Mermaid labels use as `#name;`. Unknown names stay as written. */
const NAMED_ENTITIES: Record<string, string> = {
  quot: '"',
  amp: '&',
  lt: '<',
  gt: '>',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  laquo: '«',
  raquo: '»',
  larr: '←',
  rarr: '→',
  harr: '↔',
  times: '×',
  middot: '·',
  bull: '•',
  deg: '°',
  copy: '©',
  reg: '®',
  trade: '™',
  euro: '€',
  pound: '£',
  yen: '¥',
  check: '✓',
};

/** Mermaid writes entities as `#59;` or `#quot;` inside labels. */
export function decodeEntities(text: string): string {
  return text
    .replace(/#(\d+);/g, (match, code: string) => {
      const point = Number(code);
      return point <= 0x10ffff ? String.fromCodePoint(point) : match;
    })
    .replace(/#([a-zA-Z]+);/g, (match, name: string) => NAMED_ENTITIES[name] ?? match)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** A label's lines: `<br/>` splits it, each line trimmed. */
export function splitLabel(raw: string): string[] {
  return decodeEntities(raw)
    .split(/<br\s*\/?>/i)
    .map((part) => part.trim());
}

/** A label flattened for matching: one line, single spaces, lower case. */
export function normLabel(raw: string): string {
  return decodeEntities(raw)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Words, paths and identifiers in a text, as Find and "Follow a value" see them. */
const TOKEN_RE = /\/?[\p{L}\p{N}](?:[\p{L}\p{N}_\-./]*[\p{L}\p{N}])?/gu;

export function tokens(text: string): string[] {
  return text.match(TOKEN_RE) ?? [];
}

/** A token worth following through the flow: three letters or more and not a stop word. */
export function isFollowable(token: string): boolean {
  return token.replace(/^\//, '').length >= 3 && !STOPWORDS.has(token.toLowerCase());
}

/** `path:line`, `path:from-to` or a URL, as written in `@ref` and `@uses`. */
export function isCodeRef(text: string): boolean {
  return /^(https?:\/\/\S+|\S+:\d+(?:-\d+)?)$/.test(text) && !/^https?:\/\/$/.test(text);
}
