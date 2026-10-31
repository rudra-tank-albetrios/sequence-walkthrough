import type { Flow, Step } from '@swv/core';

import type { NoteEntry } from '../storage/notes.ts';
import { route } from '../storage/notes.ts';

/** The step table as a CSV file and as a Markdown document, in version 2's exact shapes. */

export type NoteLookup = (step: Step) => NoteEntry | undefined;

export interface TableOptions {
  /** Adds the Bookmarked and Note columns. */
  notes?: NoteLookup;
  /** Glossary lines for the Markdown document; the flow's own `@term` lines when omitted. */
  terms?: { term: string; def: string }[];
}

export const CSV_COLUMNS = [
  'Step',
  'Chapter',
  'From',
  'To',
  'Kind',
  'Status',
  'Sends',
  'Does',
  'Branch',
  'Payload',
  'Also involved',
  'Effects',
  'Unconfirmed',
  'Ref',
] as const;

const branchText = (step: Step): string =>
  step.branch.map((b) => `${b.kind} ${b.label}`.trim()).join(' > ');

export function tableRows(flow: Flow, notes?: NoteLookup): { head: string[]; rows: string[][] } {
  const head: string[] = [...CSV_COLUMNS];
  if (notes) head.push('Bookmarked', 'Note');
  const rows = flow.steps.map((s) => {
    const row = [
      String(s.n),
      flow.sections[s.section]?.name ?? '',
      s.fromName,
      s.toName,
      s.kind,
      s.status ? String(s.status.code) : '',
      s.label.join(' / '),
      s.explain,
      branchText(s),
      s.payload,
      s.uses.map((u) => `${u.kind} ${u.name}${u.ref ? ` (${u.ref})` : ''}`).join('; '),
      s.effects.join('; '),
      s.unconfirmed.join('; '),
      s.refs.join(' '),
    ];
    if (notes) {
      const entry = notes(s);
      row.push(entry?.star ? 'yes' : '', entry?.note ?? '');
    }
    return row;
  });
  return { head, rows };
}

const csvCell = (value: string): string =>
  /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

const BOM = String.fromCharCode(0xfeff);

/** UTF-8 BOM, CRLF line ends, a trailing line end. */
export function csvText(flow: Flow, notes?: NoteLookup): string {
  const { head, rows } = tableRows(flow, notes);
  return `${BOM}${[head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

const mdCell = (value: string): string => value.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');

export function markdownText(flow: Flow, options: TableOptions = {}): string {
  const { notes } = options;
  const cols = ['#', 'From → To', 'Sends', 'Does', 'Branch', 'Also involved', 'Ref'];
  if (notes) cols.push('Note');
  const row = (s: Step): string => {
    const also = [
      ...s.uses.map((u) => `${u.kind} ${u.name}`),
      ...s.effects.map((t) => `effect: ${t}`),
      ...s.unconfirmed.map((t) => `unconfirmed: ${t}`),
    ].join('; ');
    const cells = [
      String(s.n),
      route(s),
      `\`${s.label.join(' / ').replace(/`/g, "'")}\``,
      s.explain || '_No explanation_',
      branchText(s),
      also,
      s.refs.join(' '),
    ];
    if (notes) {
      const entry = notes(s);
      cells.push(`${entry?.star ? '★ ' : ''}${entry?.note ?? ''}`);
    }
    return `| ${cells.map(mdCell).join(' | ')} |`;
  };
  const table = (steps: Step[]): string =>
    [`| ${cols.join(' | ')} |`, `|${cols.map(() => ' --- ').join('|')}|`, ...steps.map(row)].join('\n');

  let md = `# ${flow.title}\n\n${flow.steps.length} steps, ${flow.participants.length} layers.\n\n`;
  if (flow.trigger) md += `**Starts when:** ${flow.trigger}\n\n`;
  if (flow.scope) md += `**Scope:** ${flow.scope}\n\n`;
  if (flow.proposed) md += `**Proposed design:** this flow does not exist in the code yet.\n\n`;
  if (flow.sections.length) {
    flow.sections.forEach((sec, i) => {
      const summary = sec.summary ? `${sec.summary}\n\n` : '';
      md += `## ${i + 1}. ${sec.name}\n\n${summary}${table(flow.steps.filter((s) => s.section === i))}\n\n`;
    });
  } else md += `${table(flow.steps)}\n`;
  if (flow.uses.length) {
    const lines = flow.uses.map(
      (u) =>
        `- **${u.kind}** \`${u.name}\`${u.ref ? ` (${u.ref})` : ''}: ${u.text} (steps ${u.steps.map((i) => i + 1).join(', ')})`,
    );
    md += `\n## Behind the scenes\n\n${lines.join('\n')}\n`;
  }
  const terms = options.terms ?? flow.terms;
  if (terms.length) md += `\n## Glossary\n\n${terms.map((t) => `- **${t.term}**: ${t.def}`).join('\n')}\n`;
  return md;
}
