import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { evidenceFrom, filesRead, parseTranscript, type ToolCall } from './run-evidence.ts';
import { removeTempFolders, tempFolder } from './test-helpers.ts';

afterAll(removeTempFolders);

const at = (seconds: number): string => new Date(Date.UTC(2026, 9, 31, 10, 0, seconds)).toISOString();

const call = (time: string, name: string, input: Record<string, unknown>): string =>
  JSON.stringify({
    type: 'assistant',
    timestamp: time,
    message: { role: 'assistant', content: [{ type: 'tool_use', id: 'x', name, input }] },
  });
const text = (time: string): string =>
  JSON.stringify({ type: 'user', timestamp: time, message: { role: 'user', content: 'hello' } });

const bash = (command: string): ToolCall => ({ at: '', name: 'Bash', input: { command } });

function project(withReadme: boolean): string {
  const root = tempFolder('evidence');
  mkdirSync(join(root, 'src'));
  if (withReadme) writeFileSync(join(root, 'README.md'), '# Sample');
  writeFileSync(join(root, 'src/a.ts'), 'a');
  return root;
}

describe('parseTranscript', () => {
  it('keeps the tool calls in order with the first and last time, and skips other lines', () => {
    const lines = [text(at(0)), 'not json', call(at(5), 'Read', { file_path: 'x' }), text(at(60))];
    const transcript = parseTranscript(lines.join('\n'));
    expect(transcript.calls).toEqual([{ at: at(5), name: 'Read', input: { file_path: 'x' } }]);
    expect(transcript.first).toBe(at(0));
    expect(transcript.last).toBe(at(60));
  });
});

describe('filesRead', () => {
  it("takes the Read tool's file", () => {
    expect(filesRead({ at: '', name: 'Read', input: { file_path: '/p/src/a.ts' } })).toEqual([
      '/p/src/a.ts',
    ]);
  });

  it('takes the files a shell reader prints, once each, relative to its cd', () => {
    const command =
      'cd "/p/demo store" && cat README.md && for f in src/a.ts src/b.py; do echo "== $f"; cat -n "$f"; done';
    expect(filesRead(bash(command))).toEqual([
      resolve('/p/demo store/README.md'),
      resolve('/p/demo store/src/a.ts'),
      resolve('/p/demo store/src/b.py'),
    ]);
    expect(filesRead(bash('sed -n \'1,20p\' "D:\\demo store\\src\\a.ts"'))).toEqual([
      'D:\\demo store\\src\\a.ts',
    ]);
  });

  it('ignores searches and listings, which open nothing', () => {
    expect(filesRead(bash('grep -n "route" src/a.ts'))).toEqual([]);
    expect(filesRead(bash("find . -type f -not -path '*/node_modules/*' | head -80"))).toEqual([]);
    expect(filesRead({ at: '', name: 'Grep', input: { pattern: 'x', path: 'src/a.ts' } })).toEqual([]);
  });
});

describe('evidenceFrom', () => {
  it('reports the order, the repeats, the README, the files outside and the time', () => {
    const root = project(true);
    const jsonl = [
      call(at(0), 'Bash', { command: `cd "${root}" && cat README.md` }),
      call(at(10), 'Read', { file_path: join(root, 'src/a.ts') }),
      call(at(20), 'Bash', { command: `cd "${root}" && sed -n '1,20p' src/a.ts` }),
      call(at(30), 'Read', { file_path: join(root, '..', 'elsewhere.ts') }),
    ].join('\n');
    expect(evidenceFrom(parseTranscript(jsonl), root)).toEqual({
      seconds: 30,
      toolCalls: 4,
      reads: ['README.md', 'src/a.ts', 'src/a.ts'],
      readTwice: ['src/a.ts'],
      readmeFirst: true,
      codeFiles: 1,
      outsideProject: [join(root, '..', 'elsewhere.ts')],
    });
  });

  it('says when code came before the README, and when there was no README to open', () => {
    const root = project(true);
    const codeFirst = [
      call(at(0), 'Read', { file_path: join(root, 'src/a.ts') }),
      call(at(1), 'Read', { file_path: join(root, 'README.md') }),
    ].join('\n');
    expect(evidenceFrom(parseTranscript(codeFirst), root).readmeFirst).toBe(false);
    const bare = project(false);
    const only = call(at(0), 'Read', { file_path: join(bare, 'src/a.ts') });
    expect(evidenceFrom(parseTranscript(only), bare)).toMatchObject({
      readmeFirst: null,
      seconds: 0,
      codeFiles: 1,
    });
    expect(evidenceFrom(parseTranscript(''), bare).seconds).toBeNull();
  });
});
