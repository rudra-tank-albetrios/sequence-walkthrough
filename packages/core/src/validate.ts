// The one validator (plan decision 25): what the viewer lints, what Mermaid would refuse and the
// house style of the skills. Pure: the skills' command-line wrapper reads the files and prints.
import { parseFlow } from './parse.ts';
import type { Annotations, Flow, SequenceInfo, Step } from './types.ts';
import {
  checkLayers,
  checkLinks,
  checkReplies,
  checkUses,
  type Add,
  type Severity,
} from './validate-rules.ts';
import { SPEC_VERSION } from './version.ts';

export interface ValidationIssue {
  /** 1-based line in the code. */
  line: number;
  severity: Severity;
  code: string;
  message: string;
}

export interface ValidationSummary {
  title: string;
  mode: string;
  steps: number;
  explained: number;
  layers: number;
  chapters: string[];
  branches: Record<string, number>;
  linked: number;
  sideParts: number;
  terms: number;
  unconfirmed: number;
  threats: number;
}

/** A `path:line` code link in `@ref` or `@uses`. */
export interface CodeLink {
  /** 1-based line of the arrow or `@uses` that holds the link. */
  line: number;
  path: string;
  from: number;
  to: number;
}

export interface ValidationResult {
  /** True when nothing fails the check: no errors or warnings, and no hints when strict. */
  ok: boolean;
  issues: ValidationIssue[];
  summary: ValidationSummary;
  links: CodeLink[];
}

export interface ValidateOptions {
  /** The detailed skill's bar: hints fail too, and in-process returns need a code link as well. */
  strict?: boolean;
}

const ACCEPTED_SPECS = ['walkthrough/1', 'walkthrough/2'];
const MANY_STEPS = 8;

/** A `#` that does not start an entity: Mermaid drops the rest of the line from there. */
const BARE_HASH = /#(?!(?:\d+|[a-zA-Z][a-zA-Z0-9]*);)/;
const BLOCK_OPENER: Record<string, string> = { else: 'alt', and: 'par', option: 'critical' };

/** Lints one diagram: the viewer's lint, Mermaid's syntax traps and the skills' house style. */
export function validateDiagram(code: string, options: ValidateOptions = {}): ValidationResult {
  const strict = options.strict ?? false;
  const { annotations: ann, info, flow } = parseFlow(code);
  const issues: ValidationIssue[] = [];
  const add: Add = (line, severity, issueCode, message) => {
    issues.push({ line: Math.max(line, 0) + 1, severity, code: issueCode, message });
  };

  for (const entry of flow.lint) add(entry.line, 'warning', entry.code, entry.msg);
  scanLines(ann, add);
  if (flow.isSequence && info) {
    for (const entry of flow.syntax) add(entry.line, 'error', entry.code, entry.msg);
    checkFlowLevel(ann, flow, info, add);
    checkLayers(ann, flow, add);
    checkReplies(ann, flow, info, add);
    checkLinks(flow, info, strict, add);
    checkUses(flow, add);
  } else {
    const found = ann.diagramType || 'nothing';
    add(
      ann.typeLine,
      'error',
      'not-sequence',
      `${SPEC_VERSION} is for sequenceDiagram code (found ${found})`,
    );
  }

  const rank: Record<Severity, number> = { error: 0, warning: 1, hint: 2 };
  issues.sort((a, b) => a.line - b.line || rank[a.severity] - rank[b.severity]);
  const failing = issues.filter((issue) => strict || issue.severity !== 'hint');
  return { ok: failing.length === 0, issues, summary: summarise(flow), links: collectLinks(flow) };
}

/** Lines the parser skips or reads past: Mermaid config, cut labels and comments inside a line. */
function scanLines(ann: Annotations, add: Add): void {
  let inAccBlock = false;
  ann.lines.forEach((raw, i) => {
    const t = raw.trim();
    if (!t || i <= ann.frontMatterEnd) return;
    if (t.startsWith('%%')) {
      if (t.startsWith('%%{')) {
        add(
          i,
          'hint',
          'config',
          "%%{ ... }%% is Mermaid config; walkthrough code leaves it out so the viewer's theme applies",
        );
      }
      return;
    }
    if (i <= ann.typeLine || !/^sequenceDiagram$/i.test(ann.diagramType)) return;
    if (inAccBlock) {
      if (t.includes('}')) inAccBlock = false;
      return;
    }
    if (/^acc(Descr|Title)\s*\{/i.test(t) && !t.includes('}')) {
      inAccBlock = true;
      return;
    }
    // Colours such as `rect #fee` are fine; everywhere else a bare `#` cuts the line.
    if (BARE_HASH.test(t) && !/^(rect|box)\b/i.test(t)) {
      add(
        i,
        'warning',
        'hash-cut',
        "Mermaid drops everything after '#' in a label. Write #35; or 'No.' instead",
      );
    }
    if (t.includes('%%')) {
      add(
        i,
        'hint',
        'inline-comment',
        "Mermaid keeps '%%' inside a line as label text. Put comments on their own line",
      );
    }
  });
}

/** The line of the last `@tag` in the code, or -1. */
function tagLine(ann: Annotations, tag: string): number {
  const re = new RegExp(`^\\s*%%\\s*@${tag}\\b`, 'i');
  return ann.lines.findLastIndex((line) => re.test(line));
}

function checkFlowLevel(ann: Annotations, flow: Flow, info: SequenceInfo, add: Add): void {
  const count = flow.steps.length;
  const typeLine = ann.typeLine;
  if (count === 0) {
    add(typeLine, 'warning', 'no-arrows', 'No arrows, so there is nothing to walk through');
  }
  if (count > 0 && !info.autonumber) {
    add(
      typeLine,
      'warning',
      'no-autonumber',
      'Add autonumber after the @layer lines so every arrow is numbered where it starts',
    );
  }
  if (!ACCEPTED_SPECS.includes(ann.spec)) {
    const message = ann.spec
      ? `Unknown spec "${ann.spec}" (expected ${SPEC_VERSION})`
      : `Add %% @spec ${SPEC_VERSION} right after sequenceDiagram`;
    add(Math.max(tagLine(ann, 'spec'), typeLine), 'hint', 'spec', message);
  }
  if (ann.mode && ann.mode !== 'proposed') {
    add(
      tagLine(ann, 'mode'),
      'hint',
      'mode-value',
      `@mode "${ann.mode}" is not known (only "proposed")`,
    );
  }
  if (count > MANY_STEPS && flow.sections.length === 0) {
    add(
      typeLine,
      'hint',
      'no-sections',
      `${count} steps and no @section: split the flow into chapters by purpose`,
    );
  }
  if (count > MANY_STEPS && !ann.trigger) {
    add(
      Math.max(ann.titleLine, typeLine),
      'hint',
      'no-trigger',
      `${count} steps and no @trigger: say what starts the flow (a click, a cron, a webhook)`,
    );
  }
}

function summarise(flow: Flow): ValidationSummary {
  const blocks = new Map<number, string>();
  for (const step of flow.steps) {
    for (const branch of step.branch) {
      if (!blocks.has(branch.id)) blocks.set(branch.id, BLOCK_OPENER[branch.kind] ?? branch.kind);
    }
  }
  const branches: Record<string, number> = {};
  for (const kind of blocks.values()) branches[kind] = (branches[kind] ?? 0) + 1;
  const total = (count: (step: Step) => number) =>
    flow.steps.reduce((sum, step) => sum + count(step), 0);
  return {
    title: flow.title,
    mode: flow.mode || 'explain',
    steps: flow.steps.length,
    explained: flow.steps.filter((step) => step.explain).length,
    layers: flow.participants.length,
    chapters: flow.sections.map((section) => section.name),
    branches,
    linked: flow.steps.filter((step) => step.refs.length > 0).length,
    sideParts: total((step) => step.uses.length),
    terms: flow.terms.length,
    unconfirmed: flow.unconfirmed,
    threats: total((step) => step.threats.length),
  };
}

/** Code links of a flow. URLs are left out, and so is text after a link, such as `(pattern)`. */
function collectLinks(flow: Flow): CodeLink[] {
  const links: CodeLink[] = [];
  const read = (line: number, ref: string) => {
    const m = /^(?!https?:)(.+?):(\d+)(?:-(\d+))?$/.exec(ref.split(/\s+/)[0] ?? '');
    if (!m?.[1] || !m[2]) return;
    links.push({ line: line + 1, path: m[1], from: Number(m[2]), to: Number(m[3] ?? m[2]) });
  };
  for (const step of flow.steps) {
    for (const ref of step.refs) read(step.line, ref);
    for (const uses of step.uses) if (uses.ref) read(uses.line, uses.ref);
  }
  return links;
}
