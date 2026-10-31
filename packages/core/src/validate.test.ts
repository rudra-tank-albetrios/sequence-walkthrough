// The validator replaces validate.py (plan decision 25). The Python verdicts on every fixture were
// recorded from the last draft of validate.py, so the port is held to them, with the differences
// named below. One snippet per code then proves the codes no fixture happens to trigger.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseFlow } from './parse.ts';
import { validateDiagram, type ValidationIssue } from './validate.ts';

const fixtures = resolve(import.meta.dirname, '../fixtures');
type Verdict = [line: number, severity: string, code: string];

const python = JSON.parse(
  readFileSync(resolve(fixtures, 'validate-python.golden.json'), 'utf8'),
) as Record<string, Verdict[]>;

/** Deliberate: layer names now come from the project (plan 7.6), and the default order is new. */
const DROPPED_FROM_PYTHON = new Set(['layer-name']);
const NEW_IN_TYPESCRIPT = new Set(['layer-order', 'cron-layer', 'ref-format', 'threat-format']);

const sorted = (list: Verdict[]) => list.map((item) => item.join(' ')).sort();

describe('the same verdicts as validate.py', () => {
  for (const [name, verdicts] of Object.entries(python)) {
    it(name, () => {
      const code = readFileSync(resolve(fixtures, name), 'utf8');
      const { issues } = validateDiagram(code);
      const ours = issues
        .filter((issue) => !NEW_IN_TYPESCRIPT.has(issue.code))
        .map((issue): Verdict => [issue.line, issue.severity, issue.code]);
      const theirs = verdicts.filter(([, , issueCode]) => !DROPPED_FROM_PYTHON.has(issueCode));
      expect(sorted(ours)).toEqual(sorted(theirs));
    });
  }
});

const HEAD = `sequenceDiagram
%% @spec walkthrough/2
%% @title Sample
%% @layer A kind=client The caller
%% @layer B kind=service The callee
autonumber
participant A
participant B
`;

const manySteps = Array.from({ length: 9 }, (_, i) => `%% @step Hop.\nA->>B: hop ${i + 1}`).join('\n');

function issuesOf(code: string, strict = false): ValidationIssue[] {
  return validateDiagram(code, { strict }).issues;
}

describe('each code', () => {
  const rows: [issueCode: string, severity: string, code: string][] = [
    ['not-sequence', 'error', 'flowchart TD\n  A --> B'],
    ['semicolon', 'error', `${HEAD}%% @step Hi.\nA->>B: hi; there now`],
    ['hash-cut', 'warning', `${HEAD}%% @step Hi.\nA->>B: order #5`],
    ['inline-comment', 'hint', `${HEAD}%% @step Hi.\nA->>B: hi %% not a comment`],
    ['config', 'hint', `%%{init: {}}%%\n${HEAD}%% @step Hi.\nA->>B: hi`],
    ['no-arrows', 'warning', HEAD],
    ['no-autonumber', 'warning', `${HEAD.replace('autonumber\n', '')}%% @step Hi.\nA->>B: hi`],
    ['spec', 'hint', `${HEAD.replace('%% @spec walkthrough/2\n', '')}%% @step Hi.\nA->>B: hi`],
    ['spec', 'hint', `${HEAD.replace('walkthrough/2', 'walkthrough/9')}%% @step Hi.\nA->>B: hi`],
    ['mode-value', 'hint', `${HEAD}%% @mode dreamt\n%% @step Hi.\nA->>B: hi`],
    ['no-sections', 'hint', `${HEAD}${manySteps}`],
    ['no-trigger', 'hint', `${HEAD}${manySteps}`],
    ['layer-missing', 'hint', `${HEAD}participant C\n%% @step Hi.\nA->>C: hi`],
    ['layer-kind', 'hint', `${HEAD.replace('kind=service', 'kind=wizard')}%% @step Hi.\nA->>B: hi`],
    [
      'layer-duplicate',
      'warning',
      `${HEAD}%% @layer C kind=service Another\nparticipant C\n%% @step Hi.\nA->>C: hi`,
    ],
    [
      'cron-layer',
      'hint',
      `${HEAD}%% @layer C kind=cron Nightly\nparticipant C\n%% @step Hi.\nA->>C: hi`,
    ],
    [
      'layer-order',
      'hint',
      `${HEAD}%% @layer C kind=router Routes\nparticipant C\n%% @step Hi.\nA->>C: hi`,
    ],
    ['request-payload', 'hint', `${HEAD}%% @step Hi.\nA->>B: POST /things`],
    ['no-reply', 'hint', `${HEAD}%% @step Hi.\nA->>B: GET /things`],
    [
      'reply-status',
      'hint',
      `${HEAD}%% @step Hi.\nA->>B: GET /things\n%% @step It answers.\nB-->>A: all good`,
    ],
    [
      'reply-payload',
      'hint',
      `${HEAD}%% @step Hi.\nA->>B: GET /things\n%% @step It answers.\nB-->>A: 200 OK`,
    ],
    [
      'step-outcome',
      'hint',
      `${HEAD}%% @step Hi.\nA->>B: GET /things\n%% @step Logging ends.\n%% @payload.body { id }\nB-->>A: 200 OK`,
    ],
    [
      'many-refs',
      'hint',
      `${HEAD}%% @step Hi.\n%% @ref a.ts:1\n%% @ref b.ts:2\n%% @ref c.ts:3\nB->>A: hi`,
    ],
    ['ref-format', 'hint', `${HEAD}%% @step Hi.\n%% @ref somewhere\nB->>A: hi`],
    ['no-ref', 'hint', `${HEAD}%% @step Hi.\n%% @ref a.ts:1\nB->>A: hi\n%% @step Yo.\nB->>A: yo`],
    [
      'uses-ref',
      'hint',
      `${HEAD}%% @step Hi.\n%% @ref a.ts:1\n%% @uses util hash Hashes it\nB->>A: hi`,
    ],
    ['uses-middleware', 'hint', `${HEAD}%% @step Hi.\n%% @uses middleware auth a.ts:1 x\nB->>A: hi`],
    ['uses-layer', 'hint', `${HEAD}%% @step Hi.\n%% @uses queue mail a.ts:1 x\nB->>A: hi`],
    ['uses-kind', 'hint', `${HEAD}%% @step Hi.\n%% @uses gizmo mail a.ts:1 x\nB->>A: hi`],
    ['threat-format', 'warning', `${HEAD}%% @step Hi.\n%% @threat The token is logged\nA->>B: hi`],
  ];
  for (const [issueCode, severity, code] of rows) {
    it(`${issueCode} is a ${severity}`, () => {
      const found = issuesOf(code).find((issue) => issue.code === issueCode);
      expect(found?.severity).toBe(severity);
    });
  }

  it('a label with an entity is not a cut label', () => {
    expect(issuesOf(`${HEAD}%% @step Hi.\nA->>B: order #35;5`).map((i) => i.code)).toEqual([]);
  });

  it('the first participant may be anything, and a second store keeps its place', () => {
    const code = `sequenceDiagram
%% @spec walkthrough/2
%% @title Nightly export
%% @layer W kind=worker Starts the flow
%% @layer SVC kind=service Logic
%% @layer DB kind=db Main store
%% @layer RDS kind=cache Cache
%% @layer STO kind=db Files
autonumber
participant W
participant SVC
participant DB
participant RDS
participant STO
%% @step Hi.
W->>SVC: run()
%% @step Hi.
SVC->>DB: SELECT
%% @step Hi.
SVC->>RDS: GET
%% @step Hi.
SVC->>STO: PUT`;
    expect(issuesOf(code).map((i) => i.code)).toEqual([]);
  });
});

describe('strict', () => {
  const noReply = `${HEAD}%% @step Hi.\nA->>B: GET /things`;
  const answered = `${noReply}\n%% @step It answers.\n%% @payload.body { id }\nB-->>A: 200 OK`;

  it('hints do not fail by default', () => {
    const result = validateDiagram(noReply);
    expect(result.ok).toBe(true);
    expect(result.issues.map((i) => i.code)).toEqual(['no-reply']);
  });
  it('hints fail when strict', () => {
    expect(validateDiagram(noReply, { strict: true }).ok).toBe(false);
    expect(validateDiagram(answered, { strict: true }).ok).toBe(true);
  });
  it('in-process returns need a link only when strict', () => {
    const code = `${HEAD}%% @step Hi.\n%% @ref a.ts:1\nB->>A: find()\n%% @step Back.\nA-->>B: row\n%% @step Yes.\n%% @ref a.ts:2\nB->>A: save()\n%% @step Done.\nA-->>B: saved`;
    expect(issuesOf(code).map((i) => i.code)).toEqual([]);
    const code2 = `${HEAD}%% @step Hi.\n%% @ref a.ts:1\nA->>B: find()\n%% @step Back.\n%% @ref a.ts:2\nB-->>A: row\n%% @step Yes.\nB-->>A: more`;
    expect(issuesOf(code2).map((i) => i.code)).toEqual([]);
    expect(issuesOf(code2, true).map((i) => i.code)).toEqual(['no-ref']);
  });
});

describe('what it reports back', () => {
  const code = `sequenceDiagram
%% @spec walkthrough/2
%% @title Place order
%% @trigger The customer pays.
%% @term idempotent: safe to repeat
%% @mode proposed
%% @layer A kind=client The caller
%% @layer B kind=service The callee
autonumber
participant A
participant B
%% @section Pay
%% @summary Pays.
%% @step The caller pays.
%% @ref src/pay.ts:12-14
%% @uses util hash src/hash.ts:3 Hashes the body
%% @threat high The card number is logged
%% @unconfirmed The timeout value
A->>B: pay()
alt ok
  %% @step Fine.
  %% @ref https://example.com/docs
  B-->>A: done
else no
  %% @step Not fine.
  %% @ref src/pay.ts:20 (pattern)
  B-->>A: failed
end`;

  it('counts the parts of the flow', () => {
    expect(validateDiagram(code).summary).toEqual({
      title: 'Place order',
      mode: 'proposed',
      steps: 3,
      explained: 3,
      layers: 2,
      chapters: ['Pay'],
      branches: { alt: 1 },
      linked: 3,
      sideParts: 1,
      terms: 1,
      unconfirmed: 1,
      threats: 1,
    });
  });

  it('lists code links with their lines, and leaves URLs out', () => {
    expect(validateDiagram(code).links).toEqual([
      { line: 19, path: 'src/pay.ts', from: 12, to: 14 },
      { line: 16, path: 'src/hash.ts', from: 3, to: 3 },
      { line: 27, path: 'src/pay.ts', from: 20, to: 20 },
    ]);
  });
});

describe('@threat', () => {
  it('keeps the level and the text on the step', () => {
    const { flow } = parseFlow(`${HEAD}%% @step Hi.\n%% @threat HIGH The token is logged\nA->>B: hi`);
    expect(flow.steps[0]?.threats).toEqual([{ level: 'high', text: 'The token is logged' }]);
  });
  it('is step content, so a block with only a threat attaches to its arrow', () => {
    const { flow } = parseFlow(`${HEAD}%% @threat low Open redirect\nA->>B: hi`);
    expect(flow.steps[0]?.threats).toEqual([{ level: 'low', text: 'Open redirect' }]);
  });
  it('refuses a level it does not know', () => {
    const { flow } = parseFlow(`${HEAD}%% @threat urgent Open redirect\nA->>B: hi`);
    expect(flow.steps[0]?.threats).toEqual([]);
    expect(flow.lint.map((entry) => entry.code)).toContain('threat-format');
  });
});
