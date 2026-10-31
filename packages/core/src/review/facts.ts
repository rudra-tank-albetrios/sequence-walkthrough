import type { Flow, Step, Zone } from '../types.ts';
import { layerZone } from '../vocabulary.ts';

/**
 * Layer kinds read from participant names, for diagrams without `@layer … kind=`. Order matters:
 * "Order Service" is a service, "Redis Cache Service" is a cache.
 */
const KINDS_BY_NAME: readonly (readonly [RegExp, string])[] = [
  [/\b(db|database|postgres(ql)?|mysql|mariadb|mongo(db)?|sqlite|dynamo(db)?|sql)\b/i, 'db'],
  [/\b(redis|memcached?|cache)\b/i, 'cache'],
  [/\b(repo|repos|repository|repositories|dao)\b/i, 'repository'],
  [/\b(controllers?|handlers?)\b/i, 'controller'],
  [/\b(routes?|router)\b/i, 'router'],
  [/\b(middlewares?|guards?)\b/i, 'middleware'],
  [/\b(validators?|validation)\b/i, 'validator'],
  [/\b(serializers?|presenters?)\b/i, 'serializer'],
  [/\bdtos?\b/i, 'dto'],
  [/\bservices?\b/i, 'service'],
  [/\b(queues?|kafka|rabbit(mq)?|sqs)\b/i, 'queue'],
  [/\b(event ?bus|pub ?sub|broker)\b/i, 'eventbus'],
  [/\bworkers?\b/i, 'worker'],
  [/\b(cron|scheduler)\b/i, 'cron'],
  [/\b(stripe|paypal|twilio|sendgrid|external|third.?party)\b/i, 'external'],
  [/\b(browser|client|frontend|mobile|pages?|ui)\b/i, 'client'],
  [/\b(user|shopper|customer)\b/i, 'person'],
];

/** `OrdersController` reads as `Orders Controller`, so word boundaries find the kind. */
function kindFromName(name: string): string {
  const words = name.replace(/([\p{Ll}\d])(\p{Lu})/gu, '$1 $2').replace(/[_-]+/g, ' ');
  return KINDS_BY_NAME.find(([pattern]) => pattern.test(words))?.[1] ?? '';
}

/** What every rule needs to know about a flow, worked out once. */
export interface Facts {
  flow: Flow;
  /** Layer kind by participant alias: the `@layer` kind, else read from the name, else empty. */
  kinds: Record<string, string>;
  /** Every kind present in the flow, to ask "does this flow have a repository?". */
  present: Set<string>;
}

export function factsOf(flow: Flow): Facts {
  const kinds: Record<string, string> = {};
  for (const participant of flow.participants) {
    const annotated = flow.layers[participant.alias]?.kind;
    kinds[participant.alias] = annotated ? annotated : kindFromName(participant.name);
  }
  return { flow, kinds, present: new Set(Object.values(kinds).filter(Boolean)) };
}

export const kindOf = (facts: Facts, alias: string): string => facts.kinds[alias] ?? '';

export const zoneOf = (facts: Facts, alias: string): Zone => layerZone(kindOf(facts, alias));

/** The label, explanation, effects and side parts of a step, as one text to search. */
export function stepText(step: Step): string {
  return [
    step.label.join(' '),
    step.explain,
    ...step.effects,
    ...step.uses.map((use) => `${use.name} ${use.text}`),
  ].join(' ');
}

/** The payload lines of a step, as one text to search. */
export const payloadText = (step: Step): string => step.payloads.map((p) => p.text).join(' ');

/** A step as a finding names it: the method and path, or its label on one line. */
export function labelOf(step: Step): string {
  if (step.http) return `${step.http.method} ${step.http.path}`;
  return step.label.join(' ').trim() || 'This call';
}

/** Whether a reply leaves the backend: it goes to the client, or it answers an HTTP call. */
export function repliesToCaller(facts: Facts, step: Step): boolean {
  if (step.kind !== 'reply') return false;
  return zoneOf(facts, step.to) === 'client' || Boolean(facts.flow.steps[step.answers]?.http);
}
