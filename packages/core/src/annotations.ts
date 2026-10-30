import { findArrow } from './arrows.ts';
import { splitStatements } from './statements.ts';
import { isCodeRef } from './text.ts';
import type {
  AnnotatedArrow,
  AnnotatedPayload,
  Annotations,
  FieldNote,
  FlagTag,
  Flags,
  PayloadPart,
  SchemaRule,
  StateText,
  StepUses,
  Uses,
} from './types.ts';
import { FLAG_TAGS, KNOWN_TAGS, PAYLOAD_PARTS, SEQ_KEYWORD, STEP_TAGS } from './vocabulary.ts';

/** Step-level tags collected while waiting for the next arrow. */
interface Pending {
  step: string[];
  stepLine: number;
  payload: AnnotatedPayload[];
  refs: string[];
  uses: StepUses[];
  effects: string[];
  fields: FieldNote[];
  schema: SchemaRule[];
  state: { before: string[]; after: string[] };
  flags: Flags;
  unconfirmed: string[];
  section: string | null;
  sectionLine: number;
  firstLine: number;
  lines: number[];
}

function newPending(): Pending {
  return {
    step: [],
    stepLine: -1,
    payload: [],
    refs: [],
    uses: [],
    effects: [],
    fields: [],
    schema: [],
    state: { before: [], after: [] },
    flags: {},
    unconfirmed: [],
    section: null,
    sectionLine: -1,
    firstLine: -1,
    lines: [],
  };
}

function hasStepContent(p: Pending): boolean {
  return (
    p.step.length > 0 ||
    p.payload.length > 0 ||
    p.refs.length > 0 ||
    p.uses.length > 0 ||
    p.effects.length > 0 ||
    p.fields.length > 0 ||
    p.schema.length > 0 ||
    p.state.before.length > 0 ||
    p.state.after.length > 0 ||
    Object.keys(p.flags).length > 0 ||
    p.unconfirmed.length > 0
  );
}

/** `@uses <kind> <name> [path:line] <text>` */
export function parseUses(value: string): Uses | null {
  const words = value.split(/\s+/).filter(Boolean);
  const [kind, name, ...rest] = words;
  if (kind === undefined || name === undefined) return null;
  let ref = '';
  let text = rest;
  if (text[0] !== undefined && isCodeRef(text[0])) {
    ref = text[0];
    text = text.slice(1);
  }
  return { kind: kind.toLowerCase(), name, ref, text: text.join(' ') };
}

const isStepTag = (tag: string): boolean => (STEP_TAGS as readonly string[]).includes(tag);
const isFlagTag = (tag: string): tag is FlagTag => (FLAG_TAGS as readonly string[]).includes(tag);
const isPayloadPart = (part: string): part is PayloadPart =>
  (PAYLOAD_PARTS as readonly string[]).includes(part);

/** Splits the code into lines and finds annotations, arrow lines and the diagram type. */
export function parseAnnotations(code: string): Annotations {
  const lines = code.replace(/\r\n?/g, '\n').split('\n');
  const res: Annotations = {
    lines,
    title: '',
    titleLine: -1,
    fmTitle: '',
    kwTitle: '',
    spec: '',
    mode: '',
    scope: '',
    trigger: '',
    summary: [],
    terms: [],
    layers: {},
    sectionSummaries: {},
    arrows: [],
    lint: [],
    diagramType: '',
    typeLine: -1,
    sectionCount: 0,
    frontMatterEnd: -1,
  };
  const warn = (line: number, msg: string, code: string) => res.lint.push({ line, msg, code });

  let i = 0;
  // Front matter (--- ... ---) at the very top.
  while (i < lines.length && !lines[i]?.trim()) i++;
  if (lines[i]?.trim() === '---') {
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j] ?? '';
      if (line.trim() === '---') {
        res.frontMatterEnd = j;
        break;
      }
      const m = /^title:\s*(.+)$/.exec(line);
      if (m?.[1]) res.fmTitle = m[1].trim().replace(/^["']|["']$/g, '');
    }
    if (res.frontMatterEnd >= 0) i = res.frontMatterEnd + 1;
  }

  let pending = newPending();
  let inAccBlock = false;
  // Held in an object: it is assigned inside readTag, which TypeScript's narrowing cannot follow.
  const chapter: { last: { name: string; line: number; used: boolean } | null } = { last: null };

  const closeSection = () => {
    const last = chapter.last;
    if (last && !last.used) {
      warn(last.line, `Chapter "${last.name || '(no name)'}" has no steps`, 'empty-section');
    }
  };

  const readTag = (line: number, name: string, part: string | undefined, val: string) => {
    switch (name) {
      case 'spec':
        res.spec = val;
        break;
      case 'title':
        res.title = val;
        res.titleLine = line;
        break;
      case 'mode':
        res.mode = val.toLowerCase();
        break;
      case 'scope':
        res.scope = val;
        break;
      case 'trigger':
        res.trigger = val;
        break;
      case 'term': {
        const m = /^(.{1,60}?)\s*:\s+(.+)$/.exec(val) ?? /^(\S+)\s+(.+)$/.exec(val);
        if (m?.[1] && m[2]) {
          const term = m[1].trim();
          const entry = { term, def: m[2].trim(), line };
          const prev = res.terms.findIndex((x) => x.term.toLowerCase() === term.toLowerCase());
          if (prev >= 0) res.terms[prev] = entry;
          else res.terms.push(entry);
        } else warn(line, '@term needs a word and a definition: @term tombstone: …', 'term-empty');
        break;
      }
      case 'layer': {
        const m = /^(\S+)\s*(?:kind=(\S+)\s*)?(.*)$/.exec(val);
        if (m?.[1]) {
          res.layers[m[1]] = { text: (m[3] ?? '').trim(), kind: (m[2] ?? '').toLowerCase(), line };
        } else warn(line, '@layer needs an alias and a description', 'layer-empty');
        break;
      }
      case 'section':
        closeSection();
        if (!val) warn(line, '@section needs a name', 'empty-section');
        chapter.last = { name: val, line, used: false };
        pending.section = val || 'Untitled';
        pending.sectionLine = line;
        pending.lines.push(line);
        res.sectionCount++;
        break;
      case 'summary':
        if (chapter.last) (res.sectionSummaries[chapter.last.line] ??= []).push(val);
        else res.summary.push(val);
        if (chapter.last && !chapter.last.used) pending.lines.push(line);
        break;
      case 'step':
        if (pending.stepLine < 0) pending.stepLine = line;
        pending.step.push(val);
        break;
      case 'payload': {
        const known = part !== undefined && isPayloadPart(part);
        if (part && !known) {
          warn(
            line,
            `Unknown payload part "${part}" (known: ${PAYLOAD_PARTS.join(', ')})`,
            'payload-part',
          );
        }
        pending.payload.push({ part: known ? part : '_', text: val, line });
        break;
      }
      case 'ref':
        if (val) pending.refs.push(val);
        break;
      case 'uses': {
        const u = parseUses(val);
        if (u) pending.uses.push({ ...u, line });
        else warn(line, '@uses needs a kind and a name: @uses hook useCart …', 'uses-format');
        break;
      }
      case 'effect':
        if (val) pending.effects.push(val);
        break;
      case 'field': {
        const m = /^(\S+)\s+(.+)$/.exec(val);
        if (m?.[1] && m[2]) pending.fields.push({ name: m[1], text: m[2].trim() });
        else warn(line, '@field needs a name and where it comes from', 'field-empty');
        break;
      }
      case 'schema': {
        const m = /^(\S+)\s+(.+)$/.exec(val);
        if (m?.[1] && m[2]) pending.schema.push({ field: m[1], text: m[2].trim() });
        else warn(line, '@schema needs a field and its rule', 'schema-empty');
        break;
      }
      case 'state': {
        const m = /^(before|after)\b\s*(.*)$/i.exec(val);
        const which = m?.[1]?.toLowerCase();
        if (which === 'before' || which === 'after') pending.state[which].push((m?.[2] ?? '').trim());
        else warn(line, '@state needs before or after', 'state-kind');
        break;
      }
      case 'unconfirmed':
        pending.unconfirmed.push(val || 'Not confirmed from the code');
        break;
      default:
        if (isFlagTag(name)) pending.flags[name] = val || true;
        else {
          warn(
            line,
            `Unknown tag @${name} (known: ${KNOWN_TAGS.map((x) => '@' + x).join(', ')})`,
            'unknown-tag',
          );
        }
    }
  };

  for (; i < lines.length; i++) {
    const t = (lines[i] ?? '').trim();
    if (!t) continue;
    if (inAccBlock) {
      if (t.includes('}')) inAccBlock = false;
      continue;
    }
    const am = /^%%\s*@([A-Za-z]+(?:\.[A-Za-z]+)?)\b[ \t]?(.*)$/.exec(t);
    if (am?.[1]) {
      const [tagName = '', part] = am[1].toLowerCase().split('.');
      const val = (am[2] ?? '').trim();
      if (pending.firstLine < 0) pending.firstLine = i;
      if (isStepTag(tagName)) pending.lines.push(i);
      // Unknown tags are reported with the name as written
      readTag(i, isStepTag(tagName) || KNOWN_TAGS.includes(tagName) ? tagName : am[1], part, val);
      continue;
    }
    if (t.startsWith('%%')) continue; // ordinary comment or %%{ config }%%
    if (!res.diagramType) {
      res.diagramType = t.split(/[\s:;{]/)[0] ?? '';
      res.typeLine = i;
      continue;
    }
    if (!/^sequenceDiagram$/i.test(res.diagramType)) continue;
    if (/^acc(Descr|Title)\s*\{/i.test(t) && !t.includes('}')) {
      inAccBlock = true;
      continue;
    }
    for (const statement of splitStatements(t)) readStatement(statement, i);
  }
  /** One Mermaid statement that is not a comment: a keyword line or an arrow. */
  function readStatement(t: string, i: number) {
      if (SEQ_KEYWORD.test(t)) {
        const tm = /^title\s*:?\s*(.+)$/i.exec(t);
        if (tm?.[1]) res.kwTitle = tm[1].trim();
        return;
      }
      const colon = t.indexOf(':');
      const left = colon >= 0 ? t.slice(0, colon).trim() : t;
      if (!findArrow(left)) return;
      const arrow: AnnotatedArrow = {
        line: i,
        left,
        text: colon >= 0 ? t.slice(colon + 1).trim() : '',
        step: pending.step.join(' ').trim(),
        stepLine: pending.stepLine,
        payloads: pending.payload.slice(),
        refs: pending.refs.slice(),
        uses: pending.uses.slice(),
        effects: pending.effects.slice(),
        fields: pending.fields.slice(),
        schema: pending.schema.slice(),
        state: joinState(pending.state),
        flags: { ...pending.flags },
        unconfirmed: pending.unconfirmed.slice(),
        section: pending.section,
        sectionLine: pending.sectionLine,
        annLines: pending.lines.slice(),
      };
      if (pending.section !== null && chapter.last) chapter.last.used = true;
      res.arrows.push(arrow);
      pending = newPending();
  }

  if (hasStepContent(pending)) {
    warn(pending.lines[0] ?? lines.length - 1, 'Annotation has no arrow after it', 'orphan');
  }
  closeSection();
  return res;
}

function joinState(state: { before: string[]; after: string[] }): StateText {
  return { before: state.before.join('\n'), after: state.after.join('\n') };
}

