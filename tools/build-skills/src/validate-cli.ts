// The validator the skills run. It is bundled with @swv/core into each skill's scripts/validate.mjs,
// so a skill needs only Node to check a diagram, and the parser's rules exist in one place.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  validateDiagram,
  type ValidationIssue,
  type ValidationResult,
  type ValidationSummary,
} from '@swv/core';

import { checkLinks, type LinkedCode } from './links.ts';

const USAGE = `Check Mermaid sequence code written in the walkthrough/2 format (walkthrough/1 is accepted too).
Needs Node 20 or newer, and nothing else.

Usage:
  node validate.mjs -                     read the code from stdin (no file needed)
  node validate.mjs flow.mmd more.mmd     check files (.md files: every \`\`\`mermaid block)
  node validate.mjs --json -              machine-readable result
  node validate.mjs --strict -            the detailed bar: hints fail too, and in-process returns
                                          need a code link as well
  node validate.mjs --root <dir> -        also check that every code link points at a file and line
                                          under <dir>
  node validate.mjs --root <dir> --links -
                                          also print every code link with the line it points at

Severity:
  error    Mermaid will not draw it
  warning  the viewer's own lint, or a cut label or a broken link
  hint     house style of the skills

Exit code: 0 = no errors or warnings, 1 = errors or warnings (or hints with --strict),
2 = a file could not be read or the arguments are wrong.`;

interface Checked {
  name: string;
  ok: boolean;
  summary: ValidationSummary | null;
  issues: ValidationIssue[];
  linked: LinkedCode[];
}

interface Options {
  json: boolean;
  strict: boolean;
  links: boolean;
  root: string | null;
  paths: string[];
}

function parseArgs(argv: string[]): Options | null {
  const options: Options = { json: false, strict: false, links: false, root: null, paths: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (arg === '--json') options.json = true;
    else if (arg === '--strict') options.strict = true;
    else if (arg === '--links') options.links = true;
    else if (arg === '--root') {
      const root = argv[++i];
      if (root === undefined) return null;
      options.root = resolve(root);
    } else if (arg !== '-' && arg.startsWith('-')) return null;
    else options.paths.push(arg);
  }
  if (options.links && !options.root) return null;
  return options.paths.length > 0 ? options : null;
}

function withoutByteOrderMark(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

/** Every ```mermaid fence of a Markdown file, with the number of lines above it. */
function mermaidBlocks(text: string): { code: string; offset: number }[] {
  const lines = text.split('\n');
  const blocks: { code: string; offset: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const fence = /^\s*(```|~~~)\s*mermaid\b/.exec(lines[i] ?? '')?.[1];
    if (!fence) continue;
    let end = i + 1;
    while (end < lines.length && !(lines[end] ?? '').trim().startsWith(fence)) end++;
    blocks.push({ code: lines.slice(i + 1, end).join('\n'), offset: i + 1 });
    i = end;
  }
  return blocks;
}

function checkCode(name: string, code: string, offset: number, options: Options): Checked {
  const result: ValidationResult = validateDiagram(code, { strict: options.strict });
  const { issues: linkIssues, linked } = options.root
    ? checkLinks(result.links, options.root)
    : { issues: [], linked: [] };
  const issues = [...result.issues, ...linkIssues]
    .map((issue) => ({ ...issue, line: issue.line + offset }))
    .sort((a, b) => a.line - b.line);
  const ok = result.ok && linkIssues.length === 0;
  return { name, ok, summary: result.summary, issues, linked };
}

function checkMarkdown(name: string, text: string, options: Options): Checked[] {
  const blocks = mermaidBlocks(text);
  if (blocks.length === 0) {
    const message = 'No ```mermaid block in this Markdown file';
    const issue: ValidationIssue = { line: 1, severity: 'error', code: 'no-mermaid', message };
    return [{ name, ok: false, summary: null, issues: [issue], linked: [] }];
  }
  return blocks.map(({ code, offset }, i) =>
    checkCode(blocks.length > 1 ? `${name}#${i + 1}` : name, code, offset, options),
  );
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function describe(s: ValidationSummary): string {
  if (s.steps === 0) return 'no steps';
  const linked = s.linked > 0 ? `, ${s.linked} linked to code` : '';
  const parts = [
    `${plural(s.steps, 'step')} (${s.explained} explained${linked})`,
    plural(s.layers, 'layer'),
  ];
  if (s.chapters.length > 0) {
    parts.push(`${plural(s.chapters.length, 'chapter')}: ${s.chapters.join(', ')}`);
  }
  const branches = Object.entries(s.branches).sort(([a], [b]) => (a < b ? -1 : 1));
  if (branches.length > 0) {
    parts.push(`branches: ${branches.map(([kind, count]) => `${kind} ${count}`).join(', ')}`);
  }
  const extras = [
    s.sideParts > 0 ? plural(s.sideParts, 'side part') : '',
    s.terms > 0 ? plural(s.terms, 'term') : '',
    s.unconfirmed > 0 ? `${s.unconfirmed} unconfirmed` : '',
    s.threats > 0 ? plural(s.threats, 'threat') : '',
  ].filter(Boolean);
  if (extras.length > 0) parts.push(extras.join(', '));
  if (s.mode !== 'explain') parts.push(`mode: ${s.mode}`);
  return `"${s.title}": ${parts.join('; ')}`;
}

function printText(results: Checked[], showLinks: boolean): void {
  const count = (r: Checked, severity: string) =>
    r.issues.filter((i) => i.severity === severity).length;
  for (const r of results) {
    const file = r.name.split('#')[0] ?? r.name;
    if (r.summary) console.log(`${r.name}: ${describe(r.summary)}`);
    for (const i of r.issues) {
      console.log(`${file}:${i.line}: ${i.severity} [${i.code}] ${i.message}`);
    }
    if (showLinks) {
      for (const { path, from, code } of r.linked) {
        code?.forEach((line, i) => {
          console.log(`link ${path}:${from + i}: ${line}`);
        });
      }
    }
    const hints = count(r, 'hint');
    const hintNote = hints > 0 ? ` (${plural(hints, 'hint')})` : '';
    console.log(
      r.ok
        ? `${r.name}: clean${hintNote}`
        : `${r.name}: ${count(r, 'error')} error(s), ${count(r, 'warning')} warning(s), ${hints} hint(s)`,
    );
  }
}

function printJson(results: Checked[], ok: boolean, showLinks: boolean): void {
  const files = results.map((r) => ({
    file: r.name,
    ok: r.ok,
    summary: r.summary,
    issues: r.issues,
    ...(showLinks ? { links: r.linked } : {}),
  }));
  console.log(JSON.stringify({ ok, files }, null, 2));
}

async function main(argv: string[]): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE);
    return 0;
  }
  const options = parseArgs(argv);
  if (!options) {
    console.error(USAGE);
    return 2;
  }
  const results: Checked[] = [];
  let unreadable = false;
  for (const path of options.paths) {
    let text: string;
    try {
      text = path === '-' ? await readStdin() : readFileSync(path, 'utf8');
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      console.error(`${path}: cannot read (${why})`);
      unreadable = true;
      continue;
    }
    const name = path === '-' ? '<stdin>' : path;
    const code = withoutByteOrderMark(text).replace(/\r\n?/g, '\n');
    if (/\.(md|markdown)$/i.test(path)) results.push(...checkMarkdown(name, code, options));
    else results.push(checkCode(name, code, 0, options));
  }
  const allOk = results.every((r) => r.ok);
  if (options.json) printJson(results, allOk && !unreadable, options.links);
  else printText(results, options.links);
  if (unreadable) return 2;
  return allOk ? 0 : 1;
}

process.exitCode = await main(process.argv.slice(2));
