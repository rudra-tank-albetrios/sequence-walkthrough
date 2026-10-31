// The installer runs here only against temporary folders, never against the real ~/.claude.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { unzipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildSkills } from './build.ts';
import { KIT_NAME } from './config.ts';
import { removeTempFolders, runScript, tempFolder, type Ran } from './test-helpers.ts';

let out = '';
let installer = '';

beforeAll(async () => {
  out = tempFolder('install-build');
  await buildSkills(out);
  installer = join(out, 'install.mjs');
});
afterAll(removeTempFolders);

const install = (claude: string): Ran => runScript(installer, [claude]);
const skillFile = (claude: string, name: string) => join(claude, 'skills', name, 'SKILL.md');

function backups(claude: string): string[] {
  const folder = join(claude, 'skill-backups');
  return existsSync(folder) ? readdirSync(folder).sort() : [];
}

function plant(claude: string, name: string, text: string): void {
  mkdirSync(join(claude, 'skills', name), { recursive: true });
  writeFileSync(skillFile(claude, name), text);
}

describe('install.mjs', () => {
  it('installs both skills into an empty folder, with nothing to back up', () => {
    const claude = tempFolder('claude');
    const { status, stdout } = install(claude);
    expect(status).toBe(0);
    expect(stdout).toContain('Start a new Claude Code session');
    expect(readdirSync(join(claude, 'skills')).sort()).toEqual(['detailed-seq-diagram', 'seq-diagram']);
    expect(existsSync(join(claude, 'skills/seq-diagram/scripts/validate.mjs'))).toBe(true);
    expect(backups(claude)).toEqual([]);
  });

  it('moves the old skills and the replaced copies to backups, and leaves other skills alone', () => {
    const claude = tempFolder('claude');
    plant(claude, 'sequence-walkthrough', 'old fast');
    plant(claude, 'detailed-seqflow', 'old detailed');
    plant(claude, 'seq-diagram', 'an older build');
    plant(claude, 'my-own-skill', 'mine');

    expect(install(claude).status).toBe(0);

    const names = readdirSync(join(claude, 'skills')).sort();
    expect(names).toEqual(['detailed-seq-diagram', 'my-own-skill', 'seq-diagram']);
    expect(readFileSync(skillFile(claude, 'my-own-skill'), 'utf8')).toBe('mine');

    const saved = backups(claude);
    expect(saved).toHaveLength(3);
    const backupOf = (name: string) => {
      const found = saved.find((folder) => new RegExp(`^${name}-\\d{8}-\\d{6}$`).test(folder));
      return readFileSync(join(claude, 'skill-backups', found ?? 'none', 'SKILL.md'), 'utf8');
    };
    expect(backupOf('sequence-walkthrough')).toBe('old fast');
    expect(backupOf('detailed-seqflow')).toBe('old detailed');
    expect(backupOf('seq-diagram')).toBe('an older build');
    expect(readFileSync(skillFile(claude, 'seq-diagram'), 'utf8')).toBe(
      readFileSync(join(out, 'seq-diagram/SKILL.md'), 'utf8'),
    );
  });

  it('can run again: an up-to-date skill stays and no new backup appears', () => {
    const claude = tempFolder('claude');
    expect(install(claude).status).toBe(0);
    const { status, stdout } = install(claude);
    expect(status).toBe(0);
    expect(stdout).toContain('seq-diagram: already up to date');
    expect(stdout).toContain('detailed-seq-diagram: already up to date');
    expect(backups(claude)).toEqual([]);
  });

  it('backs up a copy someone changed, and never overwrites an earlier backup', () => {
    const claude = tempFolder('claude');
    install(claude);
    for (const edit of ['first edit', 'second edit']) {
      writeFileSync(skillFile(claude, 'seq-diagram'), edit);
      expect(install(claude).status).toBe(0);
    }
    const saved = backups(claude);
    expect(saved).toHaveLength(2);
    const texts = saved.map((folder) =>
      readFileSync(join(claude, 'skill-backups', folder, 'SKILL.md'), 'utf8'),
    );
    expect(texts.sort()).toEqual(['first edit', 'second edit']);
    expect(saved.some((folder) => folder.startsWith('.incoming'))).toBe(false);
  });

  it('notices a file added to or removed from an installed skill', () => {
    const claude = tempFolder('claude');
    install(claude);
    writeFileSync(join(claude, 'skills/seq-diagram/extra.md'), 'extra');
    install(claude);
    expect(backups(claude)).toHaveLength(1);
    expect(existsSync(join(claude, 'skills/seq-diagram/extra.md'))).toBe(false);
  });

  it('uses ~/.claude when no folder is given', () => {
    const home = tempFolder('home');
    const { status } = runScript(installer, [], { env: { HOME: home, USERPROFILE: home } });
    expect(status).toBe(0);
    expect(existsSync(skillFile(join(home, '.claude'), 'seq-diagram'))).toBe(true);
  });

  it('refuses the skills folder itself', () => {
    const claude = tempFolder('claude');
    const skills = join(claude, 'skills');
    const { status, stderr } = install(skills);
    expect(status).toBe(2);
    expect(stderr).toContain('not skills/ itself');
    expect(existsSync(skills)).toBe(false);
  });

  it.each([[['--nope']], [['a', 'b']]])('refuses the wrong arguments %j', (args: string[]) => {
    expect(runScript(installer, args).status).toBe(2);
  });

  it('explains itself', () => {
    expect(runScript(installer, ['--help']).stdout).toContain('~/.claude/skills');
  });

  it('works from the unzipped kit', () => {
    const kit = tempFolder('kit');
    const unzipped = unzipSync(readFileSync(join(out, `${KIT_NAME}.zip`)));
    for (const [name, data] of Object.entries(unzipped)) {
      const target = join(kit, name);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, data);
    }
    const claude = tempFolder('claude');
    const { status } = runScript(join(kit, KIT_NAME, 'install.mjs'), [claude]);
    expect(status).toBe(0);
    expect(existsSync(skillFile(claude, 'detailed-seq-diagram'))).toBe(true);
  });

  it('stops when the skills are not next to it', () => {
    const alone = tempFolder('alone');
    const copy = join(alone, 'install.mjs');
    writeFileSync(copy, readFileSync(installer));
    const claude = tempFolder('claude');
    const { status, stderr } = runScript(copy, [claude]);
    expect(status).toBe(1);
    expect(stderr).toContain('not found next to this script');
    expect(existsSync(join(claude, 'skills'))).toBe(false);
  });
});
