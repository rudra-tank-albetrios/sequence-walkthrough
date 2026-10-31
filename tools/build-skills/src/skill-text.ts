import type { SkillConfig } from './config.ts';

const INCLUDE = /^\{\{shared\/([\w.-]+)\}\}$/gm;
const MAX_NAME = 64;
const MAX_DESCRIPTION = 1024;

export interface FrontMatter {
  name: string;
  description: string;
}

/** Replaces each `{{shared/<file>}}` line with that shared file. Rules live in one place only. */
export function joinShared(source: string, readShared: (file: string) => string): string {
  const joined = source.replace(INCLUDE, (_line, file: string) => readShared(file).trim());
  const left = /\{\{[^}]*\}\}/.exec(joined);
  if (left) throw new Error(`Unresolved include ${left[0]}: it must be alone on its line`);
  return joined;
}

export function readFrontMatter(text: string): FrontMatter {
  const m = /^---\nname: (.*)\ndescription: (.*)\n---\n/.exec(text);
  if (!m?.[1] || !m[2]) {
    throw new Error('SKILL.md must start with front matter of exactly a name and a description line');
  }
  return { name: m[1], description: m[2] };
}

/** The rules the Claude app and strict YAML parsers hold a skill to, plus plan 7.5's trigger rule. */
export function checkFrontMatter(
  { name, description }: FrontMatter,
  skill: SkillConfig,
  others: readonly SkillConfig[],
): void {
  const fail = (why: string) => {
    throw new Error(`${skill.name}: ${why}`);
  };
  if (name !== skill.name) fail(`front matter says name "${name}"`);
  if (name.length > MAX_NAME || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
    fail(`name must be lower-case words joined by hyphens, at most ${MAX_NAME} characters`);
  }
  if (description.length > MAX_DESCRIPTION) {
    fail(`description is ${description.length} characters, the Claude app allows ${MAX_DESCRIPTION}`);
  }
  if (/[<>]/.test(description)) fail('description must not contain angle brackets');
  // It is one plain YAML line: these would end the value or make it a different kind of value.
  if (/:\s|\s#/.test(description) || /^["'!&*?|>%@`[{-]/.test(description)) {
    fail('description must stay a plain YAML line: no ": ", no " #" and no special first character');
  }
  const has = (phrase: string) => description.toLowerCase().includes(phrase.toLowerCase());
  for (const phrase of skill.triggers) {
    if (!has(phrase)) fail(`description does not say its trigger "${phrase}"`);
  }
  for (const other of others) {
    for (const phrase of other.triggers) {
      if (has(phrase)) fail(`description says "${phrase}", a trigger of ${other.name}`);
    }
  }
}

/** Paths in the skill's text that point inside the skill: each must ship with it. */
export function bundledPaths(text: string): string[] {
  const found = text.match(/(?<![\w/.-])(?:references|examples|scripts)\/[\w.-]+\.\w+/g) ?? [];
  return [...new Set(found)];
}
