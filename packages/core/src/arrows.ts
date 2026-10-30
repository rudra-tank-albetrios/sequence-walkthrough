import { LINETYPE } from './vocabulary.ts';

/**
 * The arrow in the left part of a message line (`A->>+B`). The strong forms come first so that
 * `-->>` is not read as `--` followed by `>>`; the weak forms are the cross, point and half-arrow
 * styles. An optional `+` or `-` after the arrow activates or deactivates the target.
 */
const ARROW_STRONG = /(<<-->>|<<->>|-->>|->>|-->|->)\s*[+-]?/;
const ARROW_WEAK = /(--x|-x|--\)|-\)|--?[|\\/]{1,2}|[|\\/]{1,2}--?)\s*[+-]?/;

export interface ArrowMatch {
  from: string;
  to: string;
  symbol: string;
  dotted: boolean;
  type: number;
}

const TYPE_BY_SYMBOL: Record<string, number> = {
  '->>': LINETYPE.SOLID,
  '-->>': LINETYPE.DOTTED,
  '-x': LINETYPE.SOLID_CROSS,
  '--x': LINETYPE.DOTTED_CROSS,
  '->': LINETYPE.SOLID_OPEN,
  '-->': LINETYPE.DOTTED_OPEN,
  '-)': LINETYPE.SOLID_POINT,
  '--)': LINETYPE.DOTTED_POINT,
  '<<->>': LINETYPE.BIDIRECTIONAL_SOLID,
  '<<-->>': LINETYPE.BIDIRECTIONAL_DOTTED,
};

export function findArrow(left: string): RegExpMatchArray | null {
  return ARROW_STRONG.exec(left) ?? ARROW_WEAK.exec(left);
}

/** Sender, receiver and style of a message line's left part, or null when it has no arrow. */
export function parseArrowLeft(left: string): ArrowMatch | null {
  const match = findArrow(left);
  if (match?.index === undefined) return null;
  const symbol = match[1];
  if (symbol === undefined) return null;
  const from = left.slice(0, match.index).trim();
  const to = left.slice(match.index + match[0].length).trim();
  if (!from || !to) return null;
  const dotted = symbol.includes('--');
  // The half-arrow styles (`-/`, `-|`, `-\`) are drawn like open arrows for the viewer's purposes.
  const type = TYPE_BY_SYMBOL[symbol] ?? (dotted ? LINETYPE.DOTTED_OPEN : LINETYPE.SOLID_OPEN);
  return { from, to, symbol, dotted, type };
}
