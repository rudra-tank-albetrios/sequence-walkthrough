import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { expect, test } from '@playwright/test';

// Plan sections 4 and 9, for the rules that live in the repository. These read files and use no
// browser, so they run once.
test.skip(
  ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
  'The same files in every browser.',
);

const ROOT = resolve(import.meta.dirname, '..');
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');

function filesUnder(path: string, keep: (file: string) => boolean): string[] {
  const full = join(ROOT, path);
  if (!existsSync(full)) return [];
  return readdirSync(full, { recursive: true, encoding: 'utf8' })
    .map((name) => join(full, name))
    .filter((file) => statSync(file).isFile() && keep(file))
    .map((file) => relative(ROOT, file).replace(/\\/g, '/'));
}

const isShippedCode = (file: string): boolean =>
  /\.tsx?$/.test(file) && !/\.test\.tsx?$|[\\/]test[\\/]|[\\/]testing\.ts$/.test(file);

const SHIPPED = [
  ...filesUnder('apps/web/src', isShippedCode),
  ...filesUnder('packages', (file) => isShippedCode(file) && !file.includes('node_modules')),
];

const shippedFilesMatching = (pattern: RegExp): string[] =>
  SHIPPED.filter((file) => pattern.test(read(file)));

test('there is shipped code to check', () => {
  expect(SHIPPED.length).toBeGreaterThan(50);
});

test('raw HTML reaches the page in one component only', () => {
  expect(shippedFilesMatching(/dangerouslySetInnerHTML/)).toEqual([
    'apps/web/src/features/viewer/DiagramSvg.tsx',
  ]);
});

test('no shipped code writes markup or runs text as code', () => {
  const pattern =
    /\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|document\.write|createContextualFragment|\beval\(|new Function\(|\.srcdoc\b/;
  expect(shippedFilesMatching(pattern)).toEqual([]);
});

test('Mermaid stays at the strict level, set in one place', () => {
  expect(shippedFilesMatching(/securityLevel/)).toEqual([
    'apps/web/src/features/viewer/mermaid.ts',
  ]);
  const source = read('apps/web/src/features/viewer/mermaid.ts');
  expect(source).toContain("securityLevel: 'strict'");
  expect(source).not.toMatch(/securityLevel:\s*'(?:loose|antiscript|sandbox)'/);
  expect(source).toContain('DOMPurify.sanitize');
});

test('nothing that handles keys prints to the console', () => {
  const paths = SHIPPED.filter((file) => /features\/ask-ai\/|packages\/ai\//.test(file));
  expect(paths.length).toBeGreaterThan(0);
  expect(paths.filter((file) => /\bconsole\./.test(read(file)))).toEqual([]);
});

test('keys are not stored with fake protection', () => {
  expect(shippedFilesMatching(/crypto\.subtle|CryptoJS|\bAES\b/)).toEqual([]);
});

test('every GitHub Action is pinned to a commit', () => {
  const workflows = filesUnder('.github/workflows', (file) => /\.ya?ml$/.test(file));
  expect(workflows.length).toBeGreaterThan(0);
  const uses = workflows.flatMap((file) =>
    [...read(file).matchAll(/^\s*(?:-\s*)?uses:\s*(\S+)/gm)].map((m) => m[1] ?? ''),
  );
  expect(uses.length).toBeGreaterThan(0);
  expect(uses.filter((use) => !use.startsWith('./') && !/@[0-9a-f]{40}$/.test(use))).toEqual([]);
});

test('workflows start with read-only permissions and keep no credentials', () => {
  for (const file of filesUnder('.github/workflows', (f) => /\.ya?ml$/.test(f))) {
    const text = read(file);
    expect(text, file).toMatch(/^permissions:/m);
    expect(text, file).not.toMatch(/^permissions:\s*write-all/m);
    expect(text, file).not.toMatch(/pull_request_target/);
    const count = (word: string) => text.split(word).length - 1;
    expect(count('persist-credentials: false'), file).toBe(count('actions/checkout@'));
  }
});

test('Dependabot watches both npm and the workflows', () => {
  const config = read('.github/dependabot.yml');
  expect(config).toMatch(/package-ecosystem:\s*["']?npm/);
  expect(config).toMatch(/package-ecosystem:\s*["']?github-actions/);
});

test('CI installs from the lockfile and runs Gitleaks', () => {
  expect(existsSync(join(ROOT, 'package-lock.json'))).toBe(true);
  const ci = read('.github/workflows/ci.yml');
  expect(ci).toContain('npm ci');
  expect(ci).not.toMatch(/npm install(?!\w)/);
  expect(ci).toMatch(/uses: gitleaks\/gitleaks-action@/);
  expect(ci).toContain('npm run verify');
});

test('npm audit is part of the check before a pull request', () => {
  const { scripts } = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
  expect(scripts.audit).toContain('--audit-level=high');
  expect(scripts.verify).toContain('npm run audit');
});

test('the page loads no script from another site', () => {
  const html = read('apps/web/index.html');
  expect(html).not.toMatch(/<script[^>]*\bsrc=["'](?:https?:)?\/\//i);
  expect(html).not.toMatch(/<link[^>]*\bhref=["'](?:https?:)?\/\//i);
  expect(shippedFilesMatching(/\bcdn\.|cdnjs|jsdelivr|unpkg\.com/)).toEqual([]);
});
