// The sample projects in skills/fixtures prove plan section 10's Skills and Accuracy rows as far as
// code can: each sample's expected diagram keeps the rules, matches the code and resolves every
// link; the expectations are anchored in the code; and a diagram that drifts from it is caught.
// Only a real run of a skill can show that a model writes such a diagram (docs/feature-tests.md).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { validateDiagram } from '@swv/core';
import { repoRoot } from '@swv/tool-kit';
import { describe, expect, it } from 'vitest';

import {
  checkAccuracy,
  checkEvidence,
  layerLines,
  readExpected,
  referenceTokens,
  tokenNamesPath,
  type Expected,
} from './accuracy.ts';
import { checkLinks } from './links.ts';

const FIXTURES = resolve(repoRoot, 'skills/fixtures');
const REFERENCE = resolve(repoRoot, 'skills/shared/references/layer-naming.md');
const tokens = referenceTokens(readFileSync(REFERENCE, 'utf8'));
const samples = readdirSync(FIXTURES).filter((name) =>
  existsSync(join(FIXTURES, name, 'expected.json')),
);

/** Hints a sample may get: Django runs middleware before the URL match (layer-naming.md says so). */
const EXPECTED_HINTS: Record<string, string[]> = { 'django-shop': ['layer-order'] };

/** Layers named by what they are, not by a folder: people, clients, stores and other systems. */
const UNNAMED_KINDS: ReadonlySet<string> = new Set(['person', 'client', 'db', 'external']);

const codes = (issues: { code: string }[]): string[] =>
  [...new Set(issues.map((issue) => issue.code))].sort();

function mutate(code: string, from: RegExp | string, to: string): string {
  const changed = code.replace(from, to);
  if (changed === code) throw new Error(`nothing matched ${String(from)}`);
  return changed;
}

it('covers Express, NestJS, Next.js, Django and feature folders', () => {
  const frameworks = samples.map((name) => readExpected(join(FIXTURES, name)).framework);
  expect(frameworks).toEqual(
    expect.arrayContaining(['Express', 'NestJS', 'Next.js', 'Django', 'Feature folders']),
  );
});

describe.each(samples)('%s', (name) => {
  const root = join(FIXTURES, name);
  const expected: Expected = readExpected(root);
  const code = readFileSync(join(root, 'expected.mmd'), 'utf8');

  it('anchors every expectation in the sample code', () => {
    expect(checkEvidence(expected, root)).toEqual([]);
  });

  it('has an expected diagram the validator accepts, with every link resolving', () => {
    const result = validateDiagram(code);
    expect(result.issues.filter((issue) => issue.severity !== 'hint')).toEqual([]);
    expect(codes(result.issues)).toEqual(EXPECTED_HINTS[name] ?? []);
    expect(result.ok).toBe(true);
    expect(checkLinks(result.links, root).issues).toEqual([]);
  });

  it('matches the code: layers, request, statuses, messages, fields, names and links', () => {
    expect(checkAccuracy(code, expected)).toEqual([]);
  });

  it('names each layer by a folder or file on the path that layer-naming.md maps', () => {
    const layers = layerLines(code).filter((layer) => !UNNAMED_KINDS.has(layer.kind));
    expect(layers).toHaveLength(expected.layers.filter((kind) => !UNNAMED_KINDS.has(kind)).length);
    for (const { alias, path } of layers) {
      expect(path, `@layer ${alias} names no folder or file`).not.toBeNull();
      if (path === null) continue;
      expect(existsSync(join(root, path)), `${path} is not in the sample`).toBe(true);
      expect(expected.offPath, `${path} is off the path`).not.toContain(path);
      const named = tokens.some((token) => tokenNamesPath(token, path));
      expect(named, `layer-naming.md has no folder or file token for ${path}`).toBe(true);
    }
  });

  describe('is caught when it drifts from the code', () => {
    const request = `${expected.request.method} ${expected.request.path}`;
    const field = expected.requestFields.fields[0] ?? '';
    const offPath = expected.offPath[0] ?? '';

    it('a status the code does not send', () => {
      const problems = checkAccuracy(mutate(code, /(-->>\w+: )201 Created/, '$1200 OK'), expected);
      expect(problems).toContain('no reply with status 201');
      expect(problems).toContain('status 200 is not one the code sends');
    });

    it('a path the router does not know', () => {
      const moved = mutate(code, request, `${expected.request.method} /nowhere`);
      expect(checkAccuracy(moved, expected)).toContain(`no request labelled "${request}"`);
    });

    it('a field the code does not name', () => {
      const renamed = code
        .split('\n')
        .map((line) => (line.includes('@payload') ? line.replaceAll(field, `${field}Renamed`) : line))
        .join('\n');
      expect(renamed).not.toBe(code);
      expect(checkAccuracy(renamed, expected)).toContain(`request field ${field} is in no @payload`);
    });

    it('a link to a file off the path', () => {
      const linked = mutate(code, /@ref \S+:\d+/, `@ref ${offPath}:1`);
      expect(checkAccuracy(linked, expected)).toEqual([
        expect.stringContaining(`links ${offPath}, which is off the path`),
      ]);
    });

    it('a link to a line that does not exist', () => {
      const broken = mutate(code, /(@ref \S+):\d+/, '$1:9999');
      expect(codes(checkLinks(validateDiagram(broken).links, root).issues)).toEqual(['ref-missing']);
    });

    it('middleware drawn as a side part', () => {
      const sidePart = mutate(code, /^(\s*)(\S+->>\S+: .*)$/m, '$1%% @uses middleware auth\n$1$2');
      expect(codes(validateDiagram(sidePart).issues)).toContain('uses-middleware');
    });

    it('a layer drawn twice', () => {
      const twice = mutate(
        code,
        /^(\s*)autonumber$/m,
        '$1%% @layer SVC2 kind=service Twice\n$1autonumber\n$1participant SVC2 as Service',
      );
      expect(codes(validateDiagram(twice).issues)).toContain('layer-duplicate');
    });

    it('arrows without numbers', () => {
      const unnumbered = mutate(code, /^\s*autonumber\n/m, '');
      expect(codes(validateDiagram(unnumbered).issues)).toContain('no-autonumber');
    });

    it('a label Mermaid would split', () => {
      const split = mutate(code, /^(\s*\S+->>\S+: [^\n]*)$/m, '$1; oops');
      expect(validateDiagram(split).issues.some((issue) => issue.severity === 'error')).toBe(true);
    });
  });
});
