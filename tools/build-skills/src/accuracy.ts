// Checks a diagram written about one sample project in skills/fixtures against that sample's
// expected.json: the facts a reader can verify in the code (plan section 10, Skills and Accuracy).
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { parseFlow, validateDiagram } from '@swv/core';
import { listFiles } from '@swv/tool-kit';

/** `[file, text]`: the file under the sample that holds this fact, and the text that shows it. */
type Evidence = [file: string, text: string];

export interface Expected {
  framework: string;
  prompt: string;
  request: { method: string; path: string; evidence: Evidence[] };
  /** Words the client-side layers must be named for, when the flow starts in a frontend. */
  frontend?: string[];
  /** Backend layer kinds in the order a request runs: the diagram draws exactly these, once each. */
  layers: string[];
  statuses: Record<string, Evidence>;
  /** Statuses the code can also send, which a diagram may draw or leave out. */
  alsoAllowed?: Record<string, Evidence>;
  messages: Record<string, Evidence>;
  requestFields: { file: string; fields: string[] };
  replyFields: { file: string; fields: string[] };
  /** Function, class and middleware names a diagram must keep in its labels. */
  names: string[];
  /** Files no step may link to: off the path, or tests. */
  offPath: string[];
}

const CLIENT_KINDS: ReadonlySet<string> = new Set(['person', 'client']);
const META_FILES = ['expected.json', 'expected.mmd'];

const escapeRe = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function readExpected(root: string): Expected {
  return JSON.parse(readFileSync(join(root, 'expected.json'), 'utf8')) as Expected;
}

/** Everything in the diagram that does not match the sample, one line each. Empty when it matches. */
export function checkAccuracy(code: string, expected: Expected): string[] {
  const { flow } = parseFlow(code);
  const { steps } = flow;
  const problems: string[] = [];

  const request = `${expected.request.method} ${expected.request.path}`;
  if (!steps.some((step) => step.kind === 'request' && step.labelRaw.includes(request))) {
    problems.push(`no request labelled "${request}"`);
  }

  const kinds = flow.participants.map((p) => flow.layers[p.alias]?.kind ?? '');
  const backend = kinds.filter((kind) => kind !== '' && !CLIENT_KINDS.has(kind));
  if (backend.join(' → ') !== expected.layers.join(' → ')) {
    const drawn = backend.join(' → ') || 'none';
    problems.push(`layers are ${drawn}, the code has ${expected.layers.join(' → ')}`);
  }
  for (const part of expected.frontend ?? []) {
    const named = flow.participants.some(
      (p, i) => CLIENT_KINDS.has(kinds[i] ?? '') && p.name.toLowerCase().includes(part),
    );
    if (!named) problems.push(`no client layer named for the ${part}`);
  }

  const statuses = new Set(steps.flatMap((step) => (step.status ? [String(step.status.code)] : [])));
  for (const status of Object.keys(expected.statuses)) {
    if (!statuses.has(status)) problems.push(`no reply with status ${status}`);
  }
  const allowed = new Set([
    ...Object.keys(expected.statuses),
    ...Object.keys(expected.alsoAllowed ?? {}),
  ]);
  for (const status of statuses) {
    if (!allowed.has(status)) problems.push(`status ${status} is not one the code sends`);
  }
  for (const [status, [, message]] of Object.entries(expected.messages)) {
    if (!steps.some((step) => step.labelRaw.includes(message))) {
      problems.push(`the ${status} message "${message}" is not in a label`);
    }
  }

  const payloads = steps.flatMap((step) => step.payloads.map((payload) => payload.text));
  const carried = (field: string) =>
    payloads.some((text) => new RegExp(`\\b${escapeRe(field)}\\b`).test(text));
  for (const field of expected.requestFields.fields) {
    if (!carried(field)) problems.push(`request field ${field} is in no @payload`);
  }
  for (const field of expected.replyFields.fields) {
    if (!carried(field)) problems.push(`reply field ${field} is in no @payload`);
  }

  const text = steps
    .map((step) => [step.labelRaw, step.explain, ...step.uses.map((u) => u.name)].join('\n'))
    .join('\n');
  for (const name of expected.names) {
    if (!text.includes(name)) problems.push(`${name} is named in no label or step`);
  }

  for (const link of validateDiagram(code).links) {
    if (expected.offPath.includes(link.path)) {
      problems.push(`line ${link.line} links ${link.path}, which is off the path`);
    }
  }
  return problems;
}

/** Everything in expected.json that the sample's code does not back, so expectations cannot drift. */
export function checkEvidence(expected: Expected, root: string): string[] {
  const problems: string[] = [];
  const contents = new Map<string, string | null>();
  const read = (file: string): string | null => {
    if (!contents.has(file)) {
      const path = resolve(root, file);
      contents.set(file, existsSync(path) ? readFileSync(path, 'utf8') : null);
    }
    return contents.get(file) ?? null;
  };
  const anchor = (what: string, [file, text]: Evidence) => {
    const content = read(file);
    if (content === null) problems.push(`${what}: ${file} is missing`);
    else if (!content.includes(text)) problems.push(`${what}: ${file} does not contain "${text}"`);
  };

  for (const [i, evidence] of expected.request.evidence.entries()) {
    anchor(`request evidence ${i + 1}`, evidence);
  }
  const statuses = { ...expected.statuses, ...expected.alsoAllowed };
  for (const [status, evidence] of Object.entries(statuses)) anchor(`status ${status}`, evidence);
  for (const [status, evidence] of Object.entries(expected.messages)) {
    anchor(`message ${status}`, evidence);
  }
  for (const { file, fields } of [expected.requestFields, expected.replyFields]) {
    for (const field of fields) anchor(`field ${field}`, [file, field]);
  }
  for (const file of expected.offPath) {
    if (read(file) === null) problems.push(`off-path file ${file} is missing`);
  }
  const onPath = listFiles(root).filter(
    (file) => !expected.offPath.includes(file) && !META_FILES.includes(file),
  );
  // `OrdersService.place` is anchored by a file that holds both the class and the method name.
  for (const name of expected.names) {
    const parts = name.split('.');
    const holds = (file: string) => parts.every((part) => (read(file) ?? '').includes(part));
    if (!onPath.some(holds)) problems.push(`${name} is in no file on the path`);
  }
  return problems;
}

interface LayerLine {
  alias: string;
  kind: string;
  /** The first folder or file the `@layer` text names, or null. */
  path: string | null;
}

const PATH_WORD = /(?:[\w.-]+\/)+[\w.-]*|[\w-]+\.\w+/;

/** The `@layer` lines of a diagram, with the folder or file each one names. */
export function layerLines(code: string): LayerLine[] {
  return [...code.matchAll(/^\s*%%\s*@layer\s+(\S+)\s+kind=(\S+)\s*(.*)$/gm)].map((match) => ({
    alias: match[1] ?? '',
    kind: match[2] ?? '',
    path: PATH_WORD.exec(match[3] ?? '')?.[0].replace(/[.,]$/, '') ?? null,
  }));
}

/** The words in backticks of a reference file, which is where it names folders and files. */
export function referenceTokens(markdown: string): string[] {
  return [...markdown.matchAll(/`([^`\n]+)`/g)]
    .map((match) => match[1] ?? '')
    .filter((token) => token !== '' && !/\s/.test(token));
}

function globToRegExp(glob: string): RegExp {
  const parts = glob
    .split('**/')
    .map((part) => part.split('*').map(escapeRe).join('[^/]*'))
    .join('(?:.*/)?');
  return new RegExp(`^${parts}$`);
}

/** A reference token names this path: a folder, a file name, a glob or a bare feature file name. */
export function tokenNamesPath(token: string, path: string): boolean {
  const clean = path.replace(/\/$/, '');
  const parts = clean.split('/');
  const base = parts.at(-1) ?? clean;
  if (token.endsWith('/')) return parts.includes(token.slice(0, -1));
  if (token.includes('*')) {
    const re = globToRegExp(token);
    return re.test(clean) || re.test(base);
  }
  if (token.includes('/')) return clean === token || clean.endsWith(`/${token}`);
  return base === token || base.replace(/\.\w+$/, '') === token;
}
