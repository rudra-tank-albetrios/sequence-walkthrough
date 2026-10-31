import type { Step } from '../types.ts';
import { kindOf, type Facts } from './facts.ts';
import type { Rule, RuleFinding } from './rule.ts';

const requests = (facts: Facts): Step[] => facts.flow.steps.filter((s) => s.kind === 'request');

const NO_KINDS = 'No layer in this flow has a known kind.';

/** Layers above the data that must not talk to the database themselves. */
const ABOVE_DATA = new Set(['app', 'router', 'controller', 'client', 'person']);

const directDatabase: Rule = {
  id: 'layers-direct-database',
  area: 'layers',
  title: 'A controller or route reaches the database directly',
  check(facts) {
    if (!facts.present.has('db')) return 'This flow has no database layer.';
    return requests(facts)
      .filter((s) => kindOf(facts, s.to) === 'db' && ABOVE_DATA.has(kindOf(facts, s.from)))
      .map((s) => ({
        severity: 'high',
        message: `${s.fromName} reaches ${s.toName} directly, with no service or repository between them.`,
        steps: [s.idx],
      }));
  },
};

/** Who calls `to` while `through` exists in the flow: that call goes round `through`. */
const ROUND_ABOUT: readonly { from: readonly string[]; to: string; through: string }[] = [
  { from: ['router', 'app', 'client', 'person'], to: 'service', through: 'controller' },
  {
    from: ['router', 'app', 'client', 'person', 'controller', 'middleware', 'validator'],
    to: 'repository',
    through: 'service',
  },
  { from: ['worker', 'cron'], to: 'repository', through: 'service' },
  {
    from: ['service', 'middleware', 'validator', 'worker', 'cron'],
    to: 'db',
    through: 'repository',
  },
];

const layerSkipped: Rule = {
  id: 'layers-skipped',
  area: 'layers',
  title: 'A request skips a layer this flow has',
  check(facts) {
    if (facts.present.size === 0) return NO_KINDS;
    const found: RuleFinding[] = [];
    for (const step of requests(facts)) {
      const from = kindOf(facts, step.from);
      const to = kindOf(facts, step.to);
      const hit = ROUND_ABOUT.find(
        (r) => r.to === to && r.from.includes(from) && facts.present.has(r.through),
      );
      if (hit) {
        found.push({
          severity: 'medium',
          message: `${step.fromName} calls ${step.toName} directly and skips the ${hit.through} layer.`,
          steps: [step.idx],
        });
      }
    }
    return found;
  },
};

/** Kinds a layer has no business calling, and what that layer is for. */
const OUT_OF_BOUNDS: Readonly<Record<string, { calls: readonly string[]; job: string }>> = {
  validator: {
    calls: ['db', 'repository', 'external', 'queue', 'eventbus'],
    job: 'check the request',
  },
  serializer: {
    calls: ['db', 'repository', 'service', 'external', 'queue', 'eventbus', 'cache'],
    job: 'shape the reply',
  },
  dto: {
    calls: ['db', 'repository', 'service', 'external', 'queue', 'eventbus', 'cache'],
    job: 'describe a shape',
  },
  repository: {
    calls: ['external', 'queue', 'eventbus', 'service', 'controller'],
    job: 'read and write data',
  },
};

const DATA_LAYERS = new Set(['repository', 'db']);
const DEEP_LAYERS = new Set(['service', 'repository', 'db']);

/** A service may answer with a status when it is the whole backend; not when a controller exists. */
const hasStatusPicker = (facts: Facts): boolean =>
  facts.present.has('controller') || facts.present.has('router');

const wrongWork: Rule = {
  id: 'layers-wrong-work',
  area: 'layers',
  title: 'A layer does work that belongs to another layer',
  check(facts) {
    if (facts.present.size === 0) return NO_KINDS;
    const found: RuleFinding[] = [];
    for (const step of facts.flow.steps) {
      const from = kindOf(facts, step.from);
      const to = kindOf(facts, step.to);
      const limits = OUT_OF_BOUNDS[from];
      if (step.kind === 'request' && limits?.calls.includes(to)) {
        found.push({
          severity: 'medium',
          message: `${step.fromName} calls ${step.toName}, but its job is only to ${limits.job}.`,
          steps: [step.idx],
        });
      }
      if (
        step.payloads.some((p) => p.part === 'sql') &&
        from &&
        !DATA_LAYERS.has(from) &&
        !DATA_LAYERS.has(to)
      ) {
        found.push({
          severity: 'medium',
          message: `${step.fromName} runs SQL itself. SQL belongs in the repository or the database layer.`,
          steps: [step.idx],
        });
      }
      if (step.kind === 'reply' && step.status && DEEP_LAYERS.has(from) && hasStatusPicker(facts)) {
        found.push({
          severity: 'low',
          message: `${step.fromName} answers with HTTP ${step.status.code}. Choosing the status is the controller's work.`,
          steps: [step.idx],
        });
      }
    }
    return found;
  },
};

export const LAYER_RULES: readonly Rule[] = [directDatabase, layerSkipped, wrongWork];
