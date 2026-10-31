import { describe, expect, it } from 'vitest';

import { parseThreat } from './annotations.ts';
import { parseFlow } from './parse.ts';

const flowWith = (...lines: string[]): string =>
  [
    'sequenceDiagram',
    '    %% @title Sample',
    '    participant A as Alpha',
    '    participant B as Beta',
    ...lines.map((line) => `    ${line}`),
  ].join('\n');

const codes = (code: string): string[] => parseFlow(code).flow.lint.map((entry) => entry.code);

describe('parseThreat', () => {
  it('reads a level and a short text, in any case', () => {
    expect(parseThreat('high Token sent in the URL')).toEqual({
      level: 'high',
      text: 'Token sent in the URL',
    });
    expect(parseThreat('  MEDIUM   Retries can double a charge ')).toEqual({
      level: 'medium',
      text: 'Retries can double a charge',
    });
    expect(parseThreat('low x')).toEqual({ level: 'low', text: 'x' });
  });

  it('refuses a missing level, an unknown level and a missing text', () => {
    expect(parseThreat('')).toBeNull();
    expect(parseThreat('high')).toBeNull();
    expect(parseThreat('severe Token sent in the URL')).toBeNull();
    expect(parseThreat('Token sent in the URL')).toBeNull();
  });
});

describe('@threat in a flow', () => {
  it('belongs to the next arrow and is collected over the flow', () => {
    const { flow } = parseFlow(
      flowWith(
        '%% @step Alpha asks.',
        '%% @threat high Token sent in the URL',
        '%% @threat low Response is not cached',
        'A->>B: GET /things',
        '%% @step Beta answers.',
        'B-->>A: 200 OK',
        '%% @step Alpha writes.',
        '%% @threat medium No limit on retries',
        'A->>B: POST /things',
      ),
    );
    expect(flow.steps[0]?.threats).toEqual([
      { level: 'high', text: 'Token sent in the URL' },
      { level: 'low', text: 'Response is not cached' },
    ]);
    expect(flow.steps[1]?.threats).toEqual([]);
    expect(flow.threats).toEqual([
      { level: 'high', text: 'Token sent in the URL', step: 0 },
      { level: 'low', text: 'Response is not cached', step: 0 },
      { level: 'medium', text: 'No limit on retries', step: 2 },
    ]);
    expect(flow.lint).toEqual([]);
  });

  it('counts as an annotation line of its step', () => {
    const code = flowWith('%% @threat high Token sent in the URL', 'A->>B: GET /things');
    const { flow } = parseFlow(code);
    const threatLine = code.split('\n').findIndex((line) => line.includes('@threat'));
    expect(flow.steps[0]?.annLines).toContain(threatLine);
  });

  it('lints a missing level or text and keeps the rest of the flow', () => {
    const { flow } = parseFlow(flowWith('%% @threat severe Token in URL', 'A->>B: GET /things'));
    const entry = flow.lint.find((item) => item.code === 'threat-format');
    expect(entry?.msg).toContain('@threat needs a level');
    expect(flow.steps).toHaveLength(1);
    expect(flow.threats).toEqual([]);
    expect(codes(flowWith('%% @threat', 'A->>B: GET /things'))).toContain('threat-format');
    expect(codes(flowWith('%% @threat high', 'A->>B: GET /things'))).toContain('threat-format');
  });

  it('lints text that is not short, and still shows it', () => {
    const long = 'x'.repeat(161);
    const { flow } = parseFlow(flowWith(`%% @threat low ${long}`, 'A->>B: GET /things'));
    expect(flow.lint.map((item) => item.code)).toContain('long-threat');
    expect(flow.threats).toEqual([{ level: 'low', text: long, step: 0 }]);
    expect(codes(flowWith(`%% @threat low ${'x'.repeat(160)}`, 'A->>B: GET /things'))).not.toContain(
      'long-threat',
    );
  });

  it('reports a threat with no arrow after it', () => {
    expect(codes(flowWith('A->>B: GET /things', '%% @threat high Left over'))).toContain('orphan');
  });

  it('leaves a flow without the tag with no threats', () => {
    const { flow } = parseFlow(flowWith('A->>B: GET /things'));
    expect(flow.threats).toEqual([]);
    expect(flow.steps[0]?.threats).toEqual([]);
  });
});
