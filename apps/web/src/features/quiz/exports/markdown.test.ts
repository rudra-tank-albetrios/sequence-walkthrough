import { describe, expect, it } from 'vitest';

import type { DocBlock } from './blocks.ts';
import { blocksToMarkdown } from './markdown.ts';

describe('the Markdown files', () => {
  it('writes each kind of block', () => {
    const blocks: DocBlock[] = [
      { kind: 'title', text: 'A title' },
      { kind: 'text', text: 'Some text' },
      { kind: 'heading', text: 'A heading' },
      { kind: 'question', number: 3, text: 'Who?', meta: 'Step 2' },
      { kind: 'option', text: 'One', correct: false },
      { kind: 'option', text: 'Two', correct: true },
      { kind: 'fact', label: 'Reason', text: 'Because' },
      { kind: 'table', head: ['A', 'B'], rows: [['1', '2']] },
      { kind: 'image', alt: 'A diagram', dataUrl: 'data:image/png;base64,AAAA', width: 1, height: 1 },
      { kind: 'code', language: 'mermaid', text: 'sequenceDiagram' },
    ];
    expect(blocksToMarkdown(blocks)).toBe(
      [
        '# A title',
        'Some text',
        '## A heading',
        '### 3. Who?',
        '*Step 2*',
        '- [ ] One\n- [x] Two',
        '**Reason:** Because',
        '| A | B |\n| --- | --- |\n| 1 | 2 |',
        '![A diagram](data:image/png;base64,AAAA)',
        '```mermaid\nsequenceDiagram\n```',
      ].join('\n\n') + '\n',
    );
  });

  it('keeps hostile text as text', () => {
    const hostile = '<img src=x onerror=alert(1)> [click](javascript:alert(1)) ![x](http://evil.test/a.png)';
    const out = blocksToMarkdown([
      { kind: 'question', number: 1, text: hostile, meta: hostile },
      { kind: 'option', text: hostile, correct: false },
      { kind: 'fact', label: 'Your answer', text: hostile },
    ]);
    expect(out).not.toMatch(/(^|[^\\])<img/m);
    expect(out).not.toMatch(/(^|[^\\])\[click\]/m);
    expect(out).not.toMatch(/(^|[^\\])!\[x\]/m);
  });

  it('escapes table cells: a topic from a model is text, and cannot add a column', () => {
    const out = blocksToMarkdown([
      { kind: 'table', head: ['Topic'], rows: [['<img src=x onerror=alert(1)> | [x](javascript:y)']] },
    ]);
    expect(out).not.toMatch(/(^|[^\\])<img/m);
    expect(out).not.toMatch(/(^|[^\\])\[x\]/m);
    expect(out).toContain(String.raw`\| `);
  });

  it('cannot be broken out of with a line break or a heading', () => {
    const out = blocksToMarkdown([{ kind: 'text', text: 'first\n\n# A heading of its own' }]);
    expect(out).toBe(String.raw`first \# A heading of its own` + '\n');
  });

  it('makes a fence longer than any fence inside the code', () => {
    const out = blocksToMarkdown([{ kind: 'code', language: 'mermaid', text: 'a\n```\nb' }]);
    expect(out).toBe('````mermaid\na\n```\nb\n````\n');
  });
});
