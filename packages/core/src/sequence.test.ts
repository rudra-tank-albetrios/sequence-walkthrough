import { describe, expect, it } from 'vitest';

import { cutHash, parseSequence } from './sequence.ts';

const seq = (body: string) => `sequenceDiagram\n${body}\n`;

describe('cutHash', () => {
  it('drops everything from a bare hash, like Mermaid', () => {
    expect(cutHash('close issue #42 now')).toBe('close issue');
  });

  it('keeps entities', () => {
    expect(cutHash('Say #quot;hi#quot; #59; and #35;42')).toBe('Say #quot;hi#quot; #59; and #35;42');
  });
});

describe('parseSequence', () => {
  it('returns null for other diagram types', () => {
    expect(parseSequence('flowchart TD\n  A --> B')).toBeNull();
  });

  it('orders participants by first appearance, declared or not', () => {
    const info = parseSequence(seq('participant B as Bee\nA->>B: hi\nB-->>C: ok'));
    expect(info?.participants.map((p) => `${p.alias}=${p.name}`)).toEqual(['B=Bee', 'A=A', 'C=C']);
  });

  it('records the open blocks around each arrow and notes autonumber', () => {
    const info = parseSequence(
      seq('autonumber\nalt yes\n  A->>B: one\nelse no\n  A->>B: two\nend\nA->>B: three'),
    );
    expect(info?.autonumber).toBe(true);
    expect(info?.arrows.map((a) => a.branch.map((b) => `${b.kind}:${b.label}:${String(b.first)}`))).toEqual([
      ['alt:yes:true'],
      ['else:no:false'],
      [],
    ]);
  });

  it('reports the lines Mermaid refuses', () => {
    const info = parseSequence(
      seq('A->>B\nA->>B: a; b\nelse nope\nend\nparticipant end as E\nsome words\nalt open'),
    );
    expect(info?.syntax.map((s) => s.code)).toEqual([
      'no-colon',
      'semicolon',
      'block',
      'block',
      'keyword-alias',
      'unknown-line',
      'block',
    ]);
  });

  it('reads two statements on one line, as Mermaid does with a bare semicolon', () => {
    const info = parseSequence(
      seq(['A->>B: hi; B-->>A: ok', 'A->>B: retry; wait', 'A->>B: a #59; b'].join('\n')),
    );
    expect(info?.arrows.map((a) => a.text)).toEqual(['hi', 'ok', 'retry', 'a #59; b']);
    expect(info?.syntax).toEqual([
      {
        line: 2,
        code: 'semicolon',
        msg: 'A semicolon ends a Mermaid statement, so this text is read as a new one; write #59; inside a label',
      },
    ]);
  });

  it('strips activation markers and keeps bidirectional arrows', () => {
    const info = parseSequence(seq('A->>+B: start\nB-->>-A: done\nA<<->>B: both'));
    expect(info?.arrows.map((a) => [a.from, a.to, a.type, a.dotted])).toEqual([
      ['A', 'B', 0, false],
      ['B', 'A', 1, true],
      ['A', 'B', 33, false],
    ]);
  });
});
