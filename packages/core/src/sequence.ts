import { parseArrowLeft } from './arrows.ts';
import type { BlockKind, Branch, Participant, SequenceInfo } from './types.ts';
import { BLOCK_MID, BLOCK_START, RESERVED_ALIASES } from './vocabulary.ts';

/** `#59;` and `#quot;`: the one place a `#` may appear in a label without ending it. */
const ENTITY = /^#(?:\d+|[a-zA-Z][a-zA-Z0-9]*);/;

/**
 * Mermaid treats `#` as the start of a comment unless it begins an entity, so everything from a
 * bare `#` to the end of the line is dropped, and the label is trimmed.
 */
export function cutHash(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] ?? '';
    if (ch === '#') {
      const entity = ENTITY.exec(text.slice(i));
      if (!entity) break;
      out += entity[0];
      i += entity[0].length - 1;
      continue;
    }
    out += ch;
  }
  return out.trim();
}

/** A raw `;` ends a Mermaid statement, so inside a label it is a syntax error. Entities are fine. */
function hasRawSemicolon(text: string): boolean {
  return text.replace(/#(?:\d+|[a-zA-Z][a-zA-Z0-9]*);/g, '').includes(';');
}

interface OpenBlock {
  id: number;
  kind: BlockKind | 'box' | 'rect';
  label: string;
  first: boolean;
  line: number;
}

/**
 * Reads a `sequenceDiagram` the way Mermaid 12 does: participants in order of first appearance,
 * arrows in drawing order with the blocks around them, and the lines Mermaid would refuse.
 * Returns null when the code is not a sequence diagram.
 */
export function parseSequence(code: string): SequenceInfo | null {
  const lines = code.replace(/\r\n?/g, '\n').split('\n');
  const participants: Participant[] = [];
  const known = new Map<string, Participant>();
  const info: SequenceInfo = { type: 'sequence', participants, arrows: [], autonumber: false, syntax: [] };
  const issue = (line: number, code: string, msg: string) => info.syntax.push({ line, code, msg });

  const addParticipant = (alias: string, name: string, type: Participant['type']) => {
    if (known.has(alias)) return;
    const participant = { alias, name, type };
    known.set(alias, participant);
    participants.push(participant);
  };

  let i = skipFrontMatter(lines);
  let started = false;
  let inAccBlock = false;
  const stack: OpenBlock[] = [];
  let blockId = 0;

  for (; i < lines.length; i++) {
    const t = (lines[i] ?? '').trim();
    if (!t || t.startsWith('%%')) continue;
    if (inAccBlock) {
      if (t.includes('}')) inAccBlock = false;
      continue;
    }
    if (!started) {
      if (!/^sequenceDiagram\b/i.test(t)) return null;
      started = true;
      continue;
    }
    if (/^acc(Descr|Title)\s*\{/i.test(t) && !t.includes('}')) {
      inAccBlock = true;
      continue;
    }
    const keyword = /^([A-Za-z_]+)\b/.exec(t)?.[1]?.toLowerCase() ?? '';
    const rest = t.slice(keyword.length).trim();

    if (keyword === 'autonumber') {
      info.autonumber = true;
    } else if (keyword === 'box') {
      stack.push({ id: 0, kind: 'box', label: rest, first: true, line: i });
    } else if (keyword === 'rect') {
      stack.push({ id: 0, kind: 'rect', label: rest, first: true, line: i });
    } else if (keyword in BLOCK_START) {
      const kind = BLOCK_START[keyword];
      if (kind) stack.push({ id: ++blockId, kind, label: rest, first: true, line: i });
    } else if (keyword in BLOCK_MID) {
      const mid = BLOCK_MID[keyword];
      const top = stack[stack.length - 1];
      if (!mid) continue;
      if (!top || (top.kind !== mid.opens && top.kind !== mid.kind)) {
        issue(i, 'block', `"${keyword}" is only allowed inside "${mid.opens}"`);
      } else {
        stack[stack.length - 1] = { ...top, kind: mid.kind, label: rest, first: false };
      }
    } else if (keyword === 'end') {
      if (stack.length === 0) issue(i, 'block', '"end" without an open block');
      else stack.pop();
    } else if (keyword === 'participant' || keyword === 'actor') {
      declareParticipant(rest, keyword, i);
    } else if (keyword === 'create') {
      const m = /^(participant|actor)\b(.*)$/i.exec(rest);
      if (m?.[1]) declareParticipant((m[2] ?? '').trim(), m[1].toLowerCase() === 'actor' ? 'actor' : 'participant', i);
      else issue(i, 'unknown-line', 'Mermaid cannot read this line');
    } else if (
      ['destroy', 'activate', 'deactivate', 'note', 'title', 'acctitle', 'accdescr', 'links', 'link', 'properties', 'details'].includes(keyword)
    ) {
      // Drawing hints and metadata: nothing for the walkthrough
    } else {
      readMessage(t, i);
    }
  }

  for (const open of stack) {
    if (open.kind === 'box' || open.kind === 'rect') issue(open.line, 'block', `"${open.kind}" on this line has no "end"`);
    else issue(open.line, 'block', `"${open.kind}" on this line has no "end"`);
  }
  return info;

  function declareParticipant(spec: string, type: Participant['type'], line: number) {
    const asAt = spec.search(/\s+as\s+/);
    const alias = (asAt >= 0 ? spec.slice(0, asAt) : spec).trim();
    const name = asAt >= 0 ? spec.slice(asAt).replace(/^\s+as\s+/, '').trim() : alias;
    if (!alias) {
      issue(line, 'unknown-line', 'A participant needs a name');
      return;
    }
    if (RESERVED_ALIASES.has(alias.toLowerCase())) {
      issue(line, 'keyword-alias', `"${alias}" is a Mermaid keyword and cannot be a participant`);
    }
    addParticipant(alias, name || alias, type);
  }

  function readMessage(t: string, line: number) {
    const colon = t.indexOf(':');
    const left = colon >= 0 ? t.slice(0, colon).trim() : t;
    const arrow = parseArrowLeft(left);
    if (!arrow) {
      issue(line, 'unknown-line', 'Mermaid cannot read this line');
      return;
    }
    if (colon < 0) issue(line, 'no-colon', 'An arrow needs a colon, even with an empty label: A->>B: ');
    const rawText = colon >= 0 ? t.slice(colon + 1) : '';
    if (hasRawSemicolon(rawText)) {
      issue(line, 'semicolon', 'A semicolon ends a Mermaid statement; write #59; or a comma');
    }
    if (RESERVED_ALIASES.has(arrow.from.toLowerCase()) || RESERVED_ALIASES.has(arrow.to.toLowerCase())) {
      issue(line, 'keyword-alias', 'A Mermaid keyword cannot be a participant');
    }
    addParticipant(arrow.from, arrow.from, 'participant');
    addParticipant(arrow.to, arrow.to, 'participant');
    const branch: Branch[] = stack
      .filter((b): b is OpenBlock & { kind: BlockKind } => b.kind !== 'box' && b.kind !== 'rect')
      .map((b) => ({ id: b.id, kind: b.kind, label: b.label, first: b.first }));
    info.arrows.push({
      from: arrow.from,
      to: arrow.to,
      text: cutHash(rawText),
      type: arrow.type,
      dotted: arrow.dotted,
      branch,
      line,
    });
  }
}

/** The index of the first line after a `--- ... ---` front matter block, or 0. */
function skipFrontMatter(lines: string[]): number {
  let i = 0;
  while (i < lines.length && !lines[i]?.trim()) i++;
  if (lines[i]?.trim() !== '---') return 0;
  for (let j = i + 1; j < lines.length; j++) {
    if (lines[j]?.trim() === '---') return j + 1;
  }
  return 0;
}

