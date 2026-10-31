import type { Flow, Step } from '@swv/core';

import { route, type NotesData } from '../../shared/storage/notes.ts';

const branchText = (step: Step): string =>
  step.branch.map((b) => `${b.kind} ${b.label}`.trim()).join(' > ');

export interface TableRows {
  head: string[];
  rows: string[][];
}

/** The CSV columns (docs/v2-internals.md §5), one row per step; notes add two columns. */
export function tableRows(flow: Flow, notes: NotesData, includeNotes: boolean): TableRows {
  const head = [
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
  ];
  if (includeNotes) head.push('Bookmarked', 'Note');
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
    if (includeNotes) {
      const entry = notes[s.key];
      row.push(entry?.star ? 'yes' : '', entry?.note ?? '');
    }
    return row;
  });
  return { head, rows };
}

const csvCell = (value: string): string =>
  /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/** UTF-8 BOM, CRLF rows, quoted cells where needed, as version 2 wrote it. */
export function tableCsv(flow: Flow, notes: NotesData, includeNotes: boolean): string {
  const { head, rows } = tableRows(flow, notes, includeNotes);
  return `﻿${[head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

const mdCell = (value: string): string => value.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');

/**
 * The Markdown document: title and counts, trigger, scope, proposed note, one table per chapter
 * (or one table), then Behind the scenes and the Glossary.
 */
export function tableMarkdown(flow: Flow, notes: NotesData, includeNotes: boolean): string {
  const cols = ['#', 'From → To', 'Sends', 'Does', 'Branch', 'Also involved', 'Ref'];
  if (includeNotes) cols.push('Note');
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
    if (includeNotes) {
      const entry = notes[s.key];
      cells.push(`${entry?.star ? '★ ' : ''}${entry?.note ?? ''}`);
    }
    return `| ${cells.map(mdCell).join(' | ')} |`;
  };
  const table = (steps: Step[]): string =>
    [`| ${cols.join(' | ')} |`, `|${cols.map(() => ' --- ').join('|')}|`, ...steps.map(row)].join('\n');

  let md = `# ${flow.title}\n\n${flow.steps.length} steps, ${flow.participants.length} layers.\n\n`;
  if (flow.trigger) md += `**Starts when:** ${flow.trigger}\n\n`;
  if (flow.scope) md += `**Scope:** ${flow.scope}\n\n`;
  if (flow.proposed) md += '**Proposed design:** this flow does not exist in the code yet.\n\n';
  if (flow.sections.length > 0) {
    flow.sections.forEach((section, i) => {
      const summary = section.summary ? `${section.summary}\n\n` : '';
      md += `## ${i + 1}. ${section.name}\n\n${summary}${table(flow.steps.filter((s) => s.section === i))}\n\n`;
    });
  } else {
    md += `${table(flow.steps)}\n`;
  }
  if (flow.uses.length > 0) {
    const items = flow.uses.map(
      (u) =>
        `- **${u.kind}** \`${u.name}\`${u.ref ? ` (${u.ref})` : ''}: ${u.text} (steps ${u.steps.map((i) => i + 1).join(', ')})`,
    );
    md += `\n## Behind the scenes\n\n${items.join('\n')}\n`;
  }
  if (flow.terms.length > 0) {
    md += `\n## Glossary\n\n${flow.terms.map((t) => `- **${t.term}**: ${t.def}`).join('\n')}\n`;
  }
  return md;
}
