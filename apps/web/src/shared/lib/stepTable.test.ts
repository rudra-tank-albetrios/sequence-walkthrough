// @vitest-environment node
import { parseFlow } from '@swv/core';
import { describe, expect, it } from 'vitest';

import { DEFAULT_DIAGRAM } from './defaultDiagram.ts';
import { CSV_COLUMNS, csvText, markdownText, tableRows } from './stepTable.ts';

const flow = parseFlow(DEFAULT_DIAGRAM).flow;
const BOM = String.fromCharCode(0xfeff);

const HOSTILE = parseFlow(`sequenceDiagram
  %% @title =1+1 <img src=x onerror=alert(1)> [a](javascript:alert(2))
  %% @trigger <script>alert(3)</script>
  %% @term <b>t</b>: [d](javascript:alert(4))
  %% @step @SUM(1+1) ![i](https://evil.example/i.png)
  %% @uses hook name\`<i>x</i> [u](javascript:alert(5))
  A->>B: x\` <img src=x onerror=alert(6)>
`).flow;

describe('hostile text in the step table', () => {
  it('cannot start a formula in a CSV cell', () => {
    const cells = tableRows(HOSTILE).rows.flat();
    expect(cells).toContain('@SUM(1+1) ![i](https://evil.example/i.png)');
    const csv = csvText(HOSTILE);
    expect(csv).toContain("'@SUM(1+1) ![i](https://evil.example/i.png)");
    expect(csv).not.toMatch(/(?:^|,|")[=+\-@]/m);
  });

  it('cannot open a tag, a link or an image in Markdown, outside a code span', () => {
    const md = markdownText(HOSTILE);
    const words = md.replace(/`[^`\n]*`/g, '');
    expect(words).not.toMatch(/<[a-z]/i);
    expect(words).not.toMatch(/(?<!\\)\[/);
    expect(words).toContain('&lt;img src=x');
    // Both brackets are escaped, so no reader can make a link of it.
    expect(words).toContain('\\[a\\](javascript:alert(2))');
    expect(md).toContain("`x' <img src=x onerror=alert(6)>`");
  });
});

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
