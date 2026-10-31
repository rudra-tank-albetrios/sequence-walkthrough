// Installs the skills for Claude Code, from the folder this script is in (the built output or the
// unzipped kit). Repeatable: an up-to-date skill is left alone, anything else it replaces, and the
// old skill names, move to a backup folder that Claude Code does not load skills from.
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { listFiles } from '@swv/tool-kit/files';

const USAGE = `Install the sequence diagram skills for Claude Code.

Usage:
  node install.mjs                 install into ~/.claude/skills
  node install.mjs <claude-folder> install into <claude-folder>/skills

Anything replaced goes to <claude-folder>/skill-backups, and so do the old skills sequence-walkthrough
and detailed-seqflow. Start a new Claude Code session afterwards.`;

const SKILLS = ['seq-diagram', 'detailed-seq-diagram'];
const OLD_NAMES = ['sequence-walkthrough', 'detailed-seqflow'];

function sameFiles(a: string, b: string): boolean {
  const files = listFiles(a);
  const others = listFiles(b);
  if (files.length !== others.length || files.some((file, i) => file !== others[i])) return false;
  return files.every((file) => readFileSync(join(a, file)).equals(readFileSync(join(b, file))));
}

/** `20261031-101500`, in local time. */
function stamp(now: Date): string {
  const two = (value: number) => String(value).padStart(2, '0');
  const date = `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}`;
  return `${date}-${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`;
}

function moveToBackups(path: string, backups: string, now: Date): string {
  mkdirSync(backups, { recursive: true });
  const base = join(backups, `${basename(path)}-${stamp(now)}`);
  let target = base;
  for (let n = 2; existsSync(target); n++) target = `${base}-${n}`;
  renameSync(path, target);
  return target;
}

function install(from: string, claudeFolder: string): void {
  const skills = join(claudeFolder, 'skills');
  const backups = join(claudeFolder, 'skill-backups');
  const now = new Date();
  mkdirSync(skills, { recursive: true });

  for (const name of SKILLS) {
    const source = join(from, name);
    const dest = join(skills, name);
    if (existsSync(dest) && sameFiles(source, dest)) {
      console.log(`${name}: already up to date`);
      continue;
    }
    // Copied first, so a full disk or a locked file cannot leave the skill half installed.
    mkdirSync(backups, { recursive: true });
    const incoming = join(backups, `.incoming-${name}`);
    rmSync(incoming, { recursive: true, force: true });
    cpSync(source, incoming, { recursive: true });
    if (existsSync(dest)) console.log(`${name}: moved the old copy to ${moveToBackups(dest, backups, now)}`);
    renameSync(incoming, dest);
    console.log(`${name}: installed to ${dest}`);
  }
  for (const name of OLD_NAMES) {
    const old = join(skills, name);
    if (existsSync(old)) console.log(`${name}: old skill moved to ${moveToBackups(old, backups, now)}`);
  }
  console.log('Done. Start a new Claude Code session, so it picks up the skills.');
}

function main(argv: string[]): number {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE);
    return 0;
  }
  const [folder, ...rest] = argv;
  if (rest.length > 0 || folder?.startsWith('-')) {
    console.error(USAGE);
    return 2;
  }
  const claudeFolder = resolve(folder ?? join(homedir(), '.claude'));
  if (basename(claudeFolder) === 'skills') {
    console.error(`Give the folder that holds skills/, not skills/ itself: ${dirname(claudeFolder)}`);
    return 2;
  }
  const from = dirname(fileURLToPath(import.meta.url));
  const missing = SKILLS.filter((name) => !existsSync(join(from, name, 'SKILL.md')));
  if (missing.length > 0) {
    console.error(`${missing.join(', ')} not found next to this script (${from}).`);
    return 1;
  }
  install(from, claudeFolder);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
