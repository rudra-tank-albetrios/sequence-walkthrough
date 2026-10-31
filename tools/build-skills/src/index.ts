// Builds the skills, their zips and the kit (plan 7.4). Run from the repository root:
//   npm run build:skills
// The build stops with exit code 1 when a skill breaks a rule. Sizes are checked by check-budgets.
import { readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';

import { repoRoot } from '@swv/tool-kit';

import { buildSkills, DEFAULT_OUT } from './build.ts';
import { SKILLS } from './config.ts';

try {
  await buildSkills();
} catch (error) {
  console.error(`build-skills: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
const zips = readdirSync(DEFAULT_OUT).filter((name) => name.endsWith('.zip'));
for (const { name } of SKILLS) {
  console.log(`${name}/SKILL.md ${statSync(resolve(DEFAULT_OUT, name, 'SKILL.md')).size} bytes`);
}
for (const zip of zips) console.log(`${zip} ${statSync(resolve(DEFAULT_OUT, zip)).size} bytes`);
console.log(`build-skills: wrote ${relative(repoRoot, DEFAULT_OUT).replaceAll('\\', '/')}`);
