// The rules of the validator that read one part of a flow: its layers, replies, links and side parts.
import { isCodeRef } from './text.ts';
import type { Annotations, Flow, SequenceInfo, Step } from './types.ts';
import { LAYER_KINDS, LINETYPE, USES_KINDS } from './vocabulary.ts';

/** `error`: Mermaid will not draw it. `warning`: the viewer's lint. `hint`: the skills' house style. */
export type Severity = 'error' | 'warning' | 'hint';

export type Add = (zeroBasedLine: number, severity: Severity, code: string, message: string) => void;

const MAX_REFS = 2;

/** Each of these is one participant: two services are one Service, and the labels name the class. */
const ONE_PARTICIPANT_KINDS: ReadonlySet<string> = new Set([
  'app',
  'router',
  'middleware',
  'validator',
  'controller',
  'service',
  'repository',
  'serializer',
  'dto',
  'eventbus',
  'cron',
]);

/** The default left-to-right order (plan 7.6). Kinds not listed may sit anywhere. */
const DEFAULT_ORDER = [
  'app',
  'router',
  'middleware',
  'validator',
  'controller',
  'service',
  'repository',
  'db',
  'serializer',
  'dto',
  'cache',
  'eventbus',
  'queue',
  'worker',
  'external',
];

/** `@uses` kinds that are layers of their own: when they act on the path, they are drawn. */
const USES_AS_LAYER: ReadonlySet<string> = new Set([
  'app',
  'router',
  'validator',
  'controller',
  'service',
  'repository',
  'serializer',
  'dto',
  'db',
  'redis',
  'eventbus',
  'queue',
]);

/** Words that show a reply's `@step` says what the caller gets back. */
const OUTCOME_WORD = /\b(return|get|gets|got|see|sees|told|tell|back|answer|receiv|repl|respon)/i;
export function checkLayers(ann: Annotations, flow: Flow, add: Add): void {
  const names = new Map<string, string>();
  const kinds = new Map<string, string>();
  const ordered: { alias: string; position: number; line: number }[] = [];
  const seenForOrder = new Set<string>();
  flow.participants.forEach(({ alias, name }, index) => {
    const layer = ann.layers[alias];
    const line = layer?.line ?? ann.typeLine;
    if (!layer) {
      add(ann.typeLine, 'hint', 'layer-missing', `Layer ${alias} has no @layer description`);
    }
    const key = name.replace(/\s+/g, ' ').trim().toLowerCase();
    const sameName = names.get(key);
    if (sameName !== undefined) {
      add(
        line,
        'warning',
        'layer-duplicate',
        `Layers ${sameName} and ${alias} are both "${name}": draw each layer once`,
      );
    } else names.set(key, alias);

    const kind = layer?.kind ?? '';
    if (kind && !(kind in LAYER_KINDS)) {
      const known = Object.keys(LAYER_KINDS).join(', ');
      add(line, 'hint', 'layer-kind', `Layer ${alias} has unknown kind "${kind}" (known: ${known})`);
    }
    if (ONE_PARTICIPANT_KINDS.has(kind)) {
      const sameKind = kinds.get(kind);
      if (sameKind !== undefined) {
        add(
          line,
          'warning',
          'layer-duplicate',
          `Layers ${sameKind} and ${alias} are both kind=${kind}: draw one and name the class or function in the arrow label`,
        );
      } else kinds.set(kind, alias);
    }
    if (kind === 'cron' && index > 0) {
      add(
        line,
        'hint',
        'cron-layer',
        `Layer ${alias}: a cron is drawn only when it starts the flow, and then first. Otherwise write @uses cron on the step where it acts`,
      );
    }
    // The first participant starts the flow, so it may be anything. A second store keeps its place.
    const position = DEFAULT_ORDER.indexOf(kind);
    if (index > 0 && position >= 0 && !seenForOrder.has(kind)) {
      seenForOrder.add(kind);
      ordered.push({ alias, position, line });
    }
  });
  ordered.forEach((right, i) => {
    const left = ordered[i - 1];
    if (left && right.position < left.position) {
      add(
        right.line,
        'hint',
        'layer-order',
        `Layer ${right.alias} comes before ${left.alias} in the default order (${DEFAULT_ORDER.join(', ')})`,
      );
    }
  });
}

/** Every call shows what is sent, every reply its status and outcome. */
export function checkReplies(ann: Annotations, flow: Flow, info: SequenceInfo, add: Add): void {
  for (const step of flow.steps) {
    const first = step.label[0] ?? '';
    if (step.kind === 'request' && step.http) {
      if (['POST', 'PUT', 'PATCH'].includes(step.http.method) && !step.payload) {
        add(
          step.line,
          'hint',
          'request-payload',
          `Step ${step.n}: ${first} has no @payload. Show what is sent: the body and any header that matters`,
        );
      }
      const type = info.arrows[step.idx]?.type;
      const expectsReply = type === LINETYPE.SOLID || type === LINETYPE.SOLID_OPEN;
      if (expectsReply && step.replies.length === 0) {
        add(
          step.line,
          'hint',
          'no-reply',
          `Step ${step.n}: ${first} gets no reply. Add the response arrow (-->>) with its status code`,
        );
      }
    }
    const request = step.kind === 'reply' ? flow.steps[step.answers] : undefined;
    const stepLine = ann.arrows.find((arrow) => arrow.line === step.line)?.stepLine ?? step.line;
    if (request?.http) checkReply(step, request, stepLine, add);
  }
}

function checkReply(step: Step, request: Step, stepLine: number, add: Add): void {
  const call = request.label[0] ?? '';
  if (!step.status) {
    add(
      step.line,
      'hint',
      'reply-status',
      `Step ${step.n} answers ${call}: start the label with the status code and reason, e.g. 201 Created`,
    );
    return;
  }
  const { code, reason } = step.status;
  if (code >= 200 && code < 300 && code !== 204 && !step.payload) {
    add(
      step.line,
      'hint',
      'reply-payload',
      `Step ${step.n}: the ${code} reply to ${call} has no @payload. Show what comes back`,
    );
  }
  if (!step.explain) return;
  const text = step.explain.toLowerCase();
  const reasonWords = (reason.match(/[A-Za-z]{3,}/g) ?? []).map((word) => word.toLowerCase());
  const namesOutcome =
    text.includes(String(code)) ||
    reasonWords.some((word) => text.includes(word)) ||
    OUTCOME_WORD.test(step.explain);
  if (!namesOutcome) {
    add(
      stepLine,
      'hint',
      'step-outcome',
      `Step ${step.n}: the @step of a reply should name the outcome (the status, its reason or what the caller gets back)`,
    );
  }
}

export function checkLinks(flow: Flow, info: SequenceInfo, strict: boolean, add: Add): void {
  const withCode = new Set(flow.steps.filter((step) => step.refs.length > 0).map((s) => s.from));
  const actors = new Set(info.participants.filter((p) => p.type === 'actor').map((p) => p.alias));
  for (const step of flow.steps) {
    if (step.refs.length > MAX_REFS) {
      add(
        step.line,
        'hint',
        'many-refs',
        `Step ${step.n} has ${step.refs.length} @ref lines: point at the one line where the hop happens (two at most)`,
      );
    }
    for (const ref of step.refs) {
      if (!isCodeRef(ref.split(/\s+/)[0] ?? '')) {
        add(
          step.line,
          'hint',
          'ref-format',
          `Step ${step.n}: @ref "${ref}" should be path:line or a URL`,
        );
      }
    }
    // Links are optional on in-process returns, except at the detailed skill's bar.
    const inProcessReturn = step.kind === 'reply' && !step.status;
    const exempt =
      (inProcessReturn && !strict) ||
      actors.has(step.from) ||
      flow.layers[step.from]?.kind === 'external';
    if (step.refs.length === 0 && !exempt && withCode.has(step.from)) {
      add(
        step.line,
        'hint',
        'no-ref',
        `Step ${step.n} has no @ref, but other steps from ${step.fromName} do. Link it to the line where it happens`,
      );
    }
  }
  if (withCode.size === 0) return;
  for (const step of flow.steps) {
    for (const uses of step.uses) {
      if (!uses.ref) {
        add(
          uses.line,
          'hint',
          'uses-ref',
          `Step ${step.n}: @uses ${uses.kind} ${uses.name} has no path:line. Point at where it lives`,
        );
      }
    }
  }
}

export function checkUses(flow: Flow, add: Add): void {
  for (const step of flow.steps) {
    for (const { kind, line } of step.uses) {
      if (kind === 'middleware') {
        add(
          line,
          'hint',
          'uses-middleware',
          '@uses middleware: middleware is a layer with its own @layer kind=middleware, not a side part',
        );
      } else if (USES_AS_LAYER.has(kind)) {
        add(
          line,
          'hint',
          'uses-layer',
          `@uses ${kind}: this is a layer; draw it as a participant with its own @layer`,
        );
      } else if (!USES_KINDS.includes(kind)) {
        add(
          line,
          'hint',
          'uses-kind',
          `Unknown @uses kind "${kind}" (known: ${USES_KINDS.join(', ')})`,
        );
      }
    }
  }
}
