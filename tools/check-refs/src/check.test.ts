import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { checkFlow } from './check.ts';

const project = mkdtempSync(join(tmpdir(), 'check-refs-'));
mkdirSync(join(project, 'src'));
writeFileSync(join(project, 'src/app.ts'), 'const a = 1;\n\nconst b = 2;\n');
writeFileSync(join(project, 'Dockerfile'), 'FROM node:24\n');

afterAll(() => {
  rmSync(project, { recursive: true });
});

const reasons = (line: string) => checkFlow(line, project).problems.map((p) => p.reason);

describe('checkFlow', () => {
  it.each([
    '%% @ref src/app.ts:1',
    '%% @ref src/app.ts:1-3',
    '%% @ref src/app.ts',
    '%% @ref Dockerfile:1',
    '    %% @uses hook useApp src/app.ts:3 Does the thing.',
    '%% @step The check in src/app.ts:3 runs first.',
  ])('accepts %s', (line) => {
    expect(checkFlow(line, project)).toEqual({ links: 1, problems: [] });
  });

  it.each([
    ['%% @ref src/missing.ts:1', 'file does not exist'],
    ['%% @ref src/missing.ts', 'file does not exist'],
    ['%% @ref src', 'file does not exist'],
    ['%% @ref Missingfile:3', 'file does not exist'],
    ['%% @uses hook useApp src/missing.ts:3 Does the thing.', 'file does not exist'],
    ['%% @uses hook useApp Missingfile:3 Does the thing.', 'file does not exist'],
    ['%% @step The check in src/missing.ts:3 runs first.', 'file does not exist'],
    ['%% @ref src/app.ts:4', 'file has 3 lines'],
    ['%% @ref src/app.ts:0', 'file has 3 lines'],
    ['%% @ref src/app.ts:2-9', 'file has 3 lines'],
    ['%% @ref src/app.ts:3-1', 'file has 3 lines'],
    ['%% @ref src/app.ts:2', 'points at a blank line'],
    ['%% @ref ../outside.ts:1', 'points outside the project'],
    ['%% @ref /etc/hosts:1', 'points outside the project'],
  ])('fails %s', (line, reason) => {
    expect(reasons(line)).toEqual([reason]);
  });

  it('ignores web links, host names and lines that are not comments', () => {
    const flow = [
      '%% @ref https://example.com/docs:12',
      '%% @uses external Stripe https://stripe.com/docs Takes the payment.',
      '%% @step Calls api.example.com:443 over TLS.',
      'A->>B: GET src/missing.ts:1',
    ].join('\n');
    expect(checkFlow(flow, project)).toEqual({ links: 0, problems: [] });
  });

  it('names the flow line of each broken link', () => {
    const flow = '%% @ref src/app.ts:1\nA->>B: hi\n%% @ref src/missing.ts:1';
    expect(checkFlow(flow, project).problems).toEqual([
      { line: 3, link: 'src/missing.ts:1', reason: 'file does not exist' },
    ]);
  });
});
