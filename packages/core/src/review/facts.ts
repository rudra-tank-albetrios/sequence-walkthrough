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
    const annotated = flow.layers[participant.alias]?.kind ?? '';
    kinds[participant.alias] = annotated === '' ? kindFromName(participant.name) : annotated;
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

/** Shapes of real credentials from well-known services, and private key blocks. */
export const REAL_SECRET =
  /\b(?:[sr]k_live_[0-9a-z]{8,}|AKIA[0-9A-Z]{16}|gh[pousr]_[0-9A-Za-z]{20,}|xox[abprs]-[0-9A-Za-z-]{10,}|eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{5,})\b|-----BEGIN [A-Z ]{0,40}PRIVATE KEY-----/i;

const ANY_REAL_SECRET = new RegExp(REAL_SECRET.source, 'gi');

/**
 * Names of values that must never travel in the open, found anywhere inside a name, so
 * `client_secret` and `passwordHash` count. `ssn` alone is too short to look for inside words.
 * No `\w*` around them: a quantifier next to text it could also match backtracks polynomially.
 */
export const SECRET = String.raw`pass(?:word|wd|phrase)|pwd|secret|api[_-]?key|access[_-]?key|private[_-]?key|credential|cvv|card[_-]?number|(?<![a-z0-9])ssn(?![a-z0-9])`;
/** Tokens are normal in a login reply or a header, but not in a URL, a log or a queue. */
const SECRET_OR_TOKEN = String.raw`(?:${SECRET}|token|session[_-]?id)`;

/** Names a secret or a token anywhere in a text. */
export const NAMED = new RegExp(SECRET_OR_TOKEN, 'i');

/** A word without its query string, when it has one: `/a?b=c` gives `/a`. */
const withoutQuery = (word: string): string => {
  const mark = word.indexOf('?');
  return mark >= 0 && word.includes('=') ? word.slice(0, mark) : word;
};

/**
 * A step as a finding names it. Findings go on screen and to the user's model, so a query string,
 * a password inside an address, credential-like text and any label that names a secret stay out:
 * `password=hunter2` as a label is said as "This call".
 */
export function labelOf(step: Step): string {
  if (step.http) {
    const address = withoutQuery(step.http.path).replace(/\/\/[^/@\s]*@/, '//');
    return `${step.http.method} ${address}`.replace(ANY_REAL_SECRET, '[hidden]');
  }
  const label = step.label.join(' ').trim();
  if (NAMED.test(label)) return 'This call';
  const words = label.split(/\s+/).map(withoutQuery).join(' ');
  return words.replace(ANY_REAL_SECRET, '[hidden]') || 'This call';
}

/** Whether a reply leaves the backend: it goes to the client, or it answers an HTTP call. */
export function repliesToCaller(facts: Facts, step: Step): boolean {
  if (step.kind !== 'reply') return false;
  return zoneOf(facts, step.to) === 'client' || Boolean(facts.flow.steps[step.answers]?.http);
}
