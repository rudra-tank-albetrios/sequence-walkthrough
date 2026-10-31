// @vitest-environment node
import { parseFlow } from '@swv/core';
import { describe, expect, it } from 'vitest';

import { DEFAULT_DIAGRAM } from '../../shared/lib/defaultDiagram.ts';
import { CSV_COLUMNS, csvText, markdownText, tableRows } from './table.ts';

const flow = parseFlow(DEFAULT_DIAGRAM).flow;
const BOM = String.fromCharCode(0xfeff);

describe('step table exports', () => {
  it('writes the documented CSV columns with a BOM and CRLF line ends', () => {
    const csv = csvText(flow);
    const lines = csv.split('\r\n');
    expect(csv.startsWith(BOM)).toBe(true);
    expect(lines[0]).toBe(`${BOM}${CSV_COLUMNS.join(',')}`);
    expect(lines[0]).toContain('Step,Chapter,From,To,Kind,Status,Sends,Does,Branch,Payload,Also involved,Effects,Unconfirmed,Threats,Ref');
    // one row per step, then the trailing line end
    expect(lines.length).toBe(flow.steps.length + 2);
    expect(lines[lines.length - 1]).toBe('');
  });

  it('quotes cells with commas, quotes or line breaks', () => {
    const csv = csvText(flow);
    const multiLine = flow.steps.find((s) => s.payload.includes('\n'));
    expect(multiLine).toBeDefined();
    if (multiLine) expect(csv).toContain(`"${multiLine.payload.replace(/"/g, '""')}"`);
    const plain = flow.steps.find((s) => s.explain.includes(',') && !/["\n]/.test(s.explain));
    expect(plain).toBeDefined();
    if (plain) expect(csv).toContain(`,"${plain.explain}",`);
  });

  it('adds Bookmarked and Note columns when notes are given', () => {
    const target = flow.steps[2];
    const { head, rows } = tableRows(flow, (step) =>
      step === target ? { star: true, note: 'check this' } : undefined,
    );
    expect(head.slice(-2)).toEqual(['Bookmarked', 'Note']);
    expect(rows[2]?.slice(-2)).toEqual(['yes', 'check this']);
    expect(rows[0]?.slice(-2)).toEqual(['', '']);
  });

  it('builds the Markdown document with a table per chapter and the glossary', () => {
    const md = markdownText(flow);
    expect(md.startsWith(`# ${flow.title}\n\n${flow.steps.length} steps, ${flow.participants.length} layers.`)).toBe(true);
    expect(md).toContain('**Starts when:**');
    expect(md).toContain('| # | From → To | Sends | Does | Branch | Also involved | Ref |');
    flow.sections.forEach((section, i) => {
      expect(md).toContain(`## ${i + 1}. ${section.name}`);
    });
    expect(md).toContain('## Glossary');
    expect(md).toContain('- **hold**:');
    expect(md).toContain('## Behind the scenes');
  });

  it('escapes pipes and uses the given glossary', () => {
    const md = markdownText(flow, { terms: [{ term: 'x', def: 'a | b' }] });
    expect(md).toContain('- **x**: a | b');
    expect(md).not.toContain('- **hold**:');
    for (const line of md.split('\n').filter((l) => l.startsWith('| '))) {
      expect(line.replace(/\\\|/g, '').split('|').length).toBeGreaterThanOrEqual(8);
    }
  });
});
