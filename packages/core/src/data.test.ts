import { describe, expect, it } from 'vitest';

import { payloadDiff } from './data.ts';
import { parseFlow } from './parse.ts';

describe('payloadDiff', () => {
  it('lists added, removed and changed top-level fields', () => {
    expect(payloadDiff('{"a": 1, "b": 2}', '{"b": 3, "c": 4}')).toEqual({
      added: ['c'],
      removed: ['a'],
      changed: ['b'],
    });
  });

  it('is null unless both sides are JSON objects', () => {
    expect(payloadDiff('[1]', '{}')).toBeNull();
    expect(payloadDiff('not json', '{}')).toBeNull();
  });
});

describe('parseFlow', () => {
  it('pairs replies with requests and finds the endings of the main request', () => {
    const { flow } = parseFlow(
      [
        'sequenceDiagram',
        '  %% @title Pairs',
        '  A->>B: POST /x',
        '  B->>C: save',
        '  C-->>B: ok',
        '  alt saved',
        '    B-->>A: 201 Created',
        '  else duplicate',
        '    B-->>A: 409 Conflict',
        '  end',
      ].join('\n'),
    );
    expect(flow.main).toBe(0);
    expect(flow.endings).toEqual([3, 4]);
    expect(flow.steps[4]?.isError).toBe(true);
    expect(flow.steps[4]?.inElse).toBe(true);
    expect(flow.steps[2]?.answers).toBe(1);
  });

  it('decodes entities in labels and keeps the raw text', () => {
    const { flow } = parseFlow('sequenceDiagram\n  %% @title E\n  A->>B: a #59; b #quot;c#quot;');
    expect(flow.steps[0]?.label).toEqual(['a ; b "c"']);
    expect(flow.steps[0]?.labelRaw).toBe('a #59; b #quot;c#quot;');
  });
});
