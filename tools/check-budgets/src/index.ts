// Checks the measured size budgets (plan section 5). Run from the repository root:
//   node tools/check-budgets/src/index.ts
// Exit code 1 when any budget is broken or a measured file is missing.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

import { readJsonList, repoRoot } from '@swv/tool-kit';

type Budget =
  | { name: string; kind: 'first-load-js'; html: string; maxBytesGzip: number }
  | { name: string; kind: 'file'; path: string; maxBytes: number }
  | { name: string; kind: 'text'; path: string; maxChars: number }
  | { name: string; kind: 'skill-description'; path: string; maxChars: number };

interface Result {
  name: string;
  measured: number;
  limit: number;
  unit: 'B' | 'chars';
  ok: boolean;
  detail?: string;
}

const root = repoRoot;

function readConfig(): Budget[] {
  return readJsonList<Budget>(resolve(root, 'tools/check-budgets/budgets.json'), 'budgets');
}

/** Script files the page loads before anything is shown: module scripts and their preloads. */
function firstLoadScripts(htmlPath: string): string[] {
  const html = readFileSync(htmlPath, 'utf8');
  const found = new Set<string>();
  for (const match of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)) found.add(match[1] ?? '');
  for (const match of html.matchAll(/<link\b[^>]*\brel="modulepreload"[^>]*\bhref="([^"]+)"/g)) {
    found.add(match[1] ?? '');
  }
  const dir = dirname(htmlPath);
  return [...found].filter((src) => src && !/^https?:/.test(src)).map((src) => resolve(dir, src));
}

function gzipSize(path: string): number {
  return gzipSync(readFileSync(path), { level: 9 }).length;
}

function measure(budget: Budget): Result {
  switch (budget.kind) {
    case 'first-load-js': {
      const html = resolve(root, budget.html);
      if (!existsSync(html)) {
        return { ...fail(budget.name, budget.maxBytesGzip, 'B'), detail: `${budget.html} is missing` };
      }
      const scripts = firstLoadScripts(html);
      const sizes = scripts.map((file) => ({ file, gzip: gzipSize(file) }));
      const total = sizes.reduce((sum, item) => sum + item.gzip, 0);
      const detail = sizes
        .map((item) => `${relative(dirname(html), item.file).replaceAll('\\', '/')} ${kb(item.gzip)}`)
        .join(', ');
      return { name: budget.name, measured: total, limit: budget.maxBytesGzip, unit: 'B', ok: total <= budget.maxBytesGzip, detail };
    }
    case 'file': {
      const file = resolve(root, budget.path);
      if (!existsSync(file)) {
        return { ...fail(budget.name, budget.maxBytes, 'B'), detail: `${budget.path} is missing` };
      }
      const size = statSync(file).size;
      return { name: budget.name, measured: size, limit: budget.maxBytes, unit: 'B', ok: size <= budget.maxBytes };
    }
    case 'text': {
      const file = resolve(root, budget.path);
      if (!existsSync(file)) {
        return { ...fail(budget.name, budget.maxChars, 'chars'), detail: `${budget.path} is missing` };
      }
      const chars = readFileSync(file, 'utf8').length;
      return { name: budget.name, measured: chars, limit: budget.maxChars, unit: 'chars', ok: chars <= budget.maxChars };
    }
    case 'skill-description': {
      const file = resolve(root, budget.path);
      if (!existsSync(file)) {
        return { ...fail(budget.name, budget.maxChars, 'chars'), detail: `${budget.path} is missing` };
      }
      const description = /^description:\s*(.*)$/m.exec(readFileSync(file, 'utf8'))?.[1];
      if (description === undefined) {
        return { ...fail(budget.name, budget.maxChars, 'chars'), detail: 'no description line' };
      }
      const chars = description.length;
      return { name: budget.name, measured: chars, limit: budget.maxChars, unit: 'chars', ok: chars <= budget.maxChars };
    }
  }
}

function fail(name: string, limit: number, unit: Result['unit']): Result {
  return { name, measured: Number.NaN, limit, unit, ok: false };
}

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function format(value: number, unit: Result['unit']): string {
  if (Number.isNaN(value)) return 'missing';
  return unit === 'B' ? kb(value) : `${value} chars`;
}

const results = readConfig().map(measure);
for (const result of results) {
  const mark = result.ok ? 'ok  ' : 'FAIL';
  console.log(
    `${mark} ${result.name}: ${format(result.measured, result.unit)} of ${format(result.limit, result.unit)}` +
      (result.detail ? `  (${result.detail})` : ''),
  );
}
const broken = results.filter((result) => !result.ok);
if (broken.length > 0) {
  console.error(`\ncheck-budgets: ${broken.length} budget(s) broken`);
  process.exit(1);
}
console.log(`\ncheck-budgets: ${results.length} budget(s) within limits`);
