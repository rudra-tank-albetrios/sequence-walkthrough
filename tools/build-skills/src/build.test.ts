// Runs the real build into a temporary folder, then uses what came out the way a skill does.
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

import { repoRoot } from '@swv/tool-kit';
import { unzipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildSkills } from './build.ts';
import { KIT_NAME, SKILLS } from './config.ts';
import { readFrontMatter } from './skill-text.ts';
import { removeTempFolders, runScript, tempFolder } from './test-helpers.ts';

let out = '';

beforeAll(async () => {
  out = tempFolder('build');
  await buildSkills(out);
});
afterAll(removeTempFolders);

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(dir.length + 1).replaceAll('\\', '/'))
    .sort();
}

const entries = (zip: string) => Object.keys(unzipSync(readFileSync(join(out, zip)))).sort();

describe('the built skills', () => {
  for (const { name, references, examples } of SKILLS) {
    describe(name, () => {
      it('has no include left and starts with its own front matter', () => {
        const text = readFileSync(join(out, name, 'SKILL.md'), 'utf8');
        expect(text).not.toContain('{{');
        expect(readFrontMatter(text).name).toBe(name);
      });
      it('holds everything it needs', () => {
        const files = filesUnder(join(out, name));
        expect(files).toContain('SKILL.md');
        expect(files).toContain('scripts/validate.mjs');
        for (const file of references) expect(files).toContain(`references/${file}`);
        expect(files.some((file) => file.startsWith('examples/'))).toBe(examples);
      });
      it('zips with its own folder at the top, as the Claude app expects', () => {
        const inside = filesUnder(join(out, name)).map((file) => `${name}/${file}`);
        expect(entries(`${name}.zip`)).toEqual(inside);
      });
      it('never tells the model to write a file or an artifact', () => {
        const text = readFileSync(join(out, name, 'SKILL.md'), 'utf8');
        expect(text).toContain('in one ```mermaid block');
        expect(text).toContain('Never an artifact');
        expect(text).toContain('over about 50 KB');
        expect(text).toContain('.seq.md');
      });
      it('keeps the standing rules', () => {
        const text = readFileSync(join(out, name, 'SKILL.md'), 'utf8');
        expect(text).toContain('**Middleware is always its own layer**');
        expect(text).toContain('Same layers and arrows as Explain, never merged');
        expect(text).toContain('Nothing outside it');
        expect(text).toMatch(/Read each file once/);
        expect(text).toMatch(/Never read tests/);
        expect(text).toContain('in one ```mermaid block');
        expect(text).toContain('over about 50 KB');
        expect(text).toContain('Never an artifact, canvas, document or other file');
        expect(text).toContain('Each layer once, same name and order');
        expect(text).toContain('Crons, hooks, utils, helpers, config, env values, constants and libraries are side parts');
        expect(text).toContain('Redis, Event Bus, queues and workers follow the main layers');
        expect(text).toContain('may point only to code you really opened');
        expect(text).toContain('@unconfirmed');
        expect(text).toMatch(/@threat <high\\\|medium\\\|low> <short text>` \| [^\n]*only for something (you saw|seen) in the code/);
      });
    });
  }

  it('leaves the Full detail mode out of the fast skill', () => {
    const text = readFileSync(join(out, 'seq-diagram/SKILL.md'), 'utf8');
    expect(text).not.toMatch(/full detail/i);
    expect(text).not.toContain('validate.py');
  });

  it('gives both skills the same validator', () => {
    const [a, b] = SKILLS.map(({ name }) => readFileSync(join(out, name, 'scripts/validate.mjs')));
    expect(a?.equals(b as Buffer)).toBe(true);
  });

  it('writes an installer that imports nothing but Node, and no path of this repository', () => {
    const installer = readFileSync(join(out, 'install.mjs'), 'utf8');
    expect(installer).toMatch(/\bfunction listFiles\b/);
    expect(installer).not.toMatch(/^import .* from ["'](?!node:)/m);
    expect(installer).not.toContain("'../../..'");
  });
});

describe('the examples flag', () => {
  /** The real sources, copied without the sample projects, so a test can change them. */
  function copiedSources(): string {
    const sources = tempFolder('sources');
    cpSync(resolve(repoRoot, 'skills'), sources, {
      recursive: true,
      filter: (path) => !/[\\/]fixtures([\\/]|$)/.test(path),
    });
    return sources;
  }

  it('refuses example files in a skill that ships none', async () => {
    const sources = copiedSources();
    mkdirSync(join(sources, 'seq-diagram/examples'));
    writeFileSync(join(sources, 'seq-diagram/examples/x.mmd'), CLEAN);
    await expect(buildSkills(tempFolder('flag'), sources)).rejects.toThrow('ships no examples');
  });

  it('ignores an empty examples folder in a skill that ships none', async () => {
    const sources = copiedSources();
    mkdirSync(join(sources, 'seq-diagram/examples'));
    const built = tempFolder('flag');
    await buildSkills(built, sources);
    expect(filesUnder(join(built, 'seq-diagram')).some((f) => f.startsWith('examples/'))).toBe(
      false,
    );
  });

  it('requires examples in a skill that ships them', async () => {
    const sources = copiedSources();
    rmSync(join(sources, 'detailed-seq-diagram/examples'), { recursive: true });
    await expect(buildSkills(tempFolder('flag'), sources)).rejects.toThrow(
      'examples/ is missing or empty',
    );
  });

  it('puts the guide, the installer, the folders and the zips in the kit', () => {
    const kit = entries(`${KIT_NAME}.zip`);
    for (const file of [
      'SKILL-SETUP-GUIDE.md',
      'install.mjs',
      'seq-diagram.zip',
      'detailed-seq-diagram.zip',
      'seq-diagram/SKILL.md',
      'detailed-seq-diagram/scripts/validate.mjs',
    ]) {
      expect(kit).toContain(`${KIT_NAME}/${file}`);
    }
    expect(kit.every((entry) => entry.startsWith(`${KIT_NAME}/`))).toBe(true);
  });

  it('gives the same bytes from the same sources', async () => {
    const again = tempFolder('again');
    await buildSkills(again);
    for (const zip of ['seq-diagram.zip', 'detailed-seq-diagram.zip', `${KIT_NAME}.zip`]) {
      expect(readFileSync(join(again, zip)).equals(readFileSync(join(out, zip)))).toBe(true);
    }
  });
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
const CLEAN = `${HEAD}%% @step Hi.\nA->>B: hi`;
const HINT_ONLY = `${HEAD}%% @step Hi.\nA->>B: GET /things`;
const BROKEN = `${HEAD}%% @step Hi.\nA->>B: hi; there now`;

describe('the validator script', () => {
  let script = '';
  let project = '';
  const run = (args: string[], input = '') => runScript(script, args, { input });
  const linked = (ref: string) => `${HEAD}%% @step Hi.\n%% @ref ${ref}\nB->>A: hi`;

  beforeAll(() => {
    // A folder with no node_modules anywhere near it: the script must need nothing but Node.
    const alone = tempFolder('alone');
    script = join(alone, 'validate.mjs');
    copyFileSync(join(out, 'seq-diagram/scripts/validate.mjs'), script);
    project = tempFolder('project');
    mkdirSync(join(project, 'src'));
    writeFileSync(join(project, 'src/a.ts'), 'first();\nsecond();\n');
  });

  it('reads stdin and exits 0 on clean code', () => {
    const { status, stdout } = run(['-'], CLEAN);
    expect(status).toBe(0);
    expect(stdout).toContain('<stdin>: "Sample": 1 step (1 explained); 2 layers');
    expect(stdout).toContain('<stdin>: clean');
  });
  it('exits 1 on errors and names the line', () => {
    const { status, stdout } = run(['-'], BROKEN);
    expect(status).toBe(1);
    expect(stdout).toContain('<stdin>:10: error [semicolon]');
    expect(stdout).toContain('1 error(s)');
  });
  it('lets hints pass', () => {
    const { status, stdout } = run(['-'], HINT_ONLY);
    expect(status).toBe(0);
    expect(stdout).toContain('clean (1 hint)');
  });
  it('fails on hints when strict', () => {
    expect(run(['--strict', '-'], HINT_ONLY).status).toBe(1);
  });
  it('gives a machine-readable result', () => {
    const { status, stdout } = run(['--json', '-'], BROKEN);
    expect(status).toBe(1);
    const parsed = JSON.parse(stdout) as {
      ok: boolean;
      files: { file: string; ok: boolean; summary: { steps: number }; issues: { code: string }[] }[];
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.files[0]?.file).toBe('<stdin>');
    expect(parsed.files[0]?.summary.steps).toBe(1);
    expect(parsed.files[0]?.issues.map((issue) => issue.code)).toContain('semicolon');
  });
  it('handles a byte order mark and Windows line ends', () => {
    const windows = String.fromCharCode(0xfeff) + CLEAN.replaceAll('\n', '\r\n');
    expect(run(['-'], windows).status).toBe(0);
  });
  it('checks every ```mermaid block of a Markdown file, with real line numbers', () => {
    const folder = tempFolder('markdown');
    const file = join(folder, 'flow.seq.md');
    writeFileSync(file, `# Flow\n\n\`\`\`mermaid\n${BROKEN}\n\`\`\`\n`);
    const { status, stdout } = run([file]);
    expect(status).toBe(1);
    expect(stdout).toContain('flow.seq.md:13: error [semicolon]');
  });
  it('refuses a Markdown file with no diagram', () => {
    const folder = tempFolder('markdown');
    const file = join(folder, 'notes.md');
    writeFileSync(file, 'Only words.\n');
    const { status, stdout } = run([file]);
    expect(status).toBe(1);
    expect(stdout).toContain('[no-mermaid]');
  });
  it.each([[[]], [['--nope', '-']], [['--root']], [['--links', '-']]])(
    'exits 2 on the wrong arguments %j',
    (args: string[]) => {
      expect(run(args).status).toBe(2);
    },
  );
  it('exits 2 on an unreadable file', () => {
    const { status, stderr } = run([join(project, 'missing.mmd')]);
    expect(status).toBe(2);
    expect(stderr).toContain('cannot read');
  });
  it('accepts a link that points at a real line with --root', () => {
    expect(run(['--root', project, '-'], linked('src/a.ts:2')).status).toBe(0);
  });
  it.each([
    ['src/a.ts:3', 'the file has 2 lines'],
    ['src/a.ts:2-1', 'the range 2-1 runs backwards'],
    ['src/a.ts:0-1', 'the file has 2 lines'],
    ['src/none.ts:1', 'no such file'],
    ['../outside.ts:1', 'points outside the project'],
    ['src:1', 'no such file'],
  ])('refuses the link %s with --root', (ref, why) => {
    const { status, stdout } = run(['--root', project, '-'], linked(ref));
    expect(status).toBe(1);
    expect(stdout).toContain('[ref-missing]');
    expect(stdout).toContain(why);
  });
  it('prints each link with its code line, so nothing is opened twice', () => {
    const { status, stdout } = run(['--root', project, '--links', '-'], linked('src/a.ts:1-2'));
    expect(status).toBe(0);
    expect(stdout).toContain('link src/a.ts:1: first();');
    expect(stdout).toContain('link src/a.ts:2: second();');
  });
  it('is the file the build wrote, with no import of the workspace', () => {
    const text = readFileSync(script, 'utf8');
    expect(text).not.toContain('@swv/');
    expect(statSync(script).size).toBeGreaterThan(1000);
  });
});
