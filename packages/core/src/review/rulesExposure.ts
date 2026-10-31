import type { Step } from '../types.ts';
import { kindOf, labelOf, payloadText, REAL_SECRET, repliesToCaller, type Facts } from './facts.ts';
import type { Rule, RuleFinding } from './rule.ts';

/**
 * Names of values that must never travel in the open, found anywhere inside a name, so
 * `client_secret` and `passwordHash` count. `ssn` alone is too short to look for inside words.
 * No `\w*` around them: a quantifier next to text it could also match backtracks polynomially.
 */
const SECRET = String.raw`pass(?:word|wd|phrase)|pwd|secret|api[_-]?key|access[_-]?key|private[_-]?key|credential|cvv|card[_-]?number|(?<![a-z0-9])ssn(?![a-z0-9])`;
/** Tokens are normal in a login reply or a header, but not in a URL, a log or a queue. */
const SECRET_OR_TOKEN = String.raw`(?:${SECRET}|token|session[_-]?id)`;

/** Every key of a query string: `?a=1&b=2` gives `a` and `b`. A key holds no `=`, so this is linear. */
const QUERY_KEY = /[?&]([^=&\s]+)=/g;
const NAMED = new RegExp(SECRET_OR_TOKEN, 'i');
/** A field holding a secret in a reply: `"password": …`, `apiKey=…`, `passwordHash: …`. */
const SECRET_FIELD = new RegExp(String.raw`(?:${SECRET})\w*["']?\s*[:=]`, 'i');

/** "Logs the password" is a log. "Logs the user in" is not. */
const LOG_WORD = /\b(logger|logging|logs?|logged)\b(?!\s+(?:\w+\s+){0,2}(?:in|out)\b)/i;
const LOGGER_NAME = /\b(logger|logs?|logging|audit)\b/i;

/** Everything a step writes in a URL: the path in its label and its query payload. */
function urlProblem(step: Step): boolean {
  const keys = [...step.label.join(' ').matchAll(QUERY_KEY)].map((match) => match[1] ?? '');
  return (
    keys.some((key) => NAMED.test(key)) ||
    step.payloads.some((p) => p.part === 'query' && NAMED.test(p.text))
  );
}

function logProblem(step: Step): boolean {
  const notes = [...step.effects, ...step.uses.map((use) => `${use.name} ${use.text}`)];
  if (notes.some((note) => LOG_WORD.test(note) && NAMED.test(note))) return true;
  if (!LOGGER_NAME.test(step.toName)) return false;
  return NAMED.test(`${step.label.join(' ')} ${payloadText(step)}`);
}

function queueProblem(facts: Facts, step: Step): boolean {
  const carried = new Set(['queue', 'eventbus']);
  const onQueue =
    carried.has(kindOf(facts, step.to)) ||
    carried.has(kindOf(facts, step.from)) ||
    step.payloads.some((p) => p.part === 'event');
  return onQueue && NAMED.test(`${step.label.join(' ')} ${payloadText(step)}`);
}

function replyProblem(facts: Facts, step: Step): boolean {
  if (!repliesToCaller(facts, step)) return false;
  const body = step.payloads.filter((p) => ['body', 'result', '_'].includes(p.part));
  return body.some((p) => SECRET_FIELD.test(p.text));
}

const secretExposed: Rule = {
  id: 'secret-exposed',
  area: 'exposure',
  title: 'A password, token or secret is in a URL, log, reply or queue',
  check(facts) {
    const found: RuleFinding[] = [];
    const add = (step: Step, severity: RuleFinding['severity'], where: string) => {
      found.push({ severity, message: `${labelOf(step)}: ${where}`, steps: [step.idx] });
    };
    for (const step of facts.flow.steps) {
      if (urlProblem(step)) add(step, 'high', 'a secret or token is in the URL.');
      if (logProblem(step)) add(step, 'high', 'a secret or token is written to a log.');
      if (queueProblem(facts, step))
        add(step, 'high', 'a secret or token travels through a queue.');
      if (replyProblem(facts, step)) add(step, 'high', 'a reply carries a password or secret.');
      if (REAL_SECRET.test(`${step.label.join(' ')} ${payloadText(step)}`)) {
        add(step, 'medium', 'this looks like a real credential. Use a fake example value.');
      }
    }
    return found;
  },
};

export const EXPOSURE_RULES: readonly Rule[] = [secretExposed];
