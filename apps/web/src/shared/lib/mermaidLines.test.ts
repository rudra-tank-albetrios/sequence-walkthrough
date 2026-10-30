import { describe, expect, it } from 'vitest';

import { errorLine, mermaidLineToCode } from './mermaidLines.ts';

describe('mermaidLineToCode', () => {
  it('skips front matter, comments and the blank lines above comments', () => {
    const code = ['---', 'title: x', '---', 'sequenceDiagram', '', '  %% @step a', '  A->>B: one', '  %% @step b', '  A->>B: two'].join('\n');
    // Mermaid sees: sequenceDiagram (1), A->>B: one (2), A->>B: two (3)
    expect(mermaidLineToCode(code, 2)).toBe(6);
    expect(mermaidLineToCode(code, 3)).toBe(8);
  });

  it('reads the line out of a parse error message', () => {
    const code = 'sequenceDiagram\n  %% @title t\n  A->>B\n';
    expect(errorLine(code, 'Parse error on line 2:\n...')).toBe(2);
    expect(errorLine(code, 'Something else')).toBeNull();
  });
});
