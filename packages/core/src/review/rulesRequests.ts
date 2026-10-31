import type { Step } from '../types.ts';
import { kindOf, labelOf, stepText, zoneOf, type Facts } from './facts.ts';
import type { Rule } from './rule.ts';

/** An HTTP request that arrives at this backend, not one the backend sends to somebody else. */
function entersBackend(facts: Facts, step: Step): boolean {
  if (step.kind !== 'request' || !step.http) return false;
  return zoneOf(facts, step.to) !== 'outside' && zoneOf(facts, step.from) !== 'ours';
}

const VALIDATION_WORDS =
  /\b(validat\w*|schema|sanitis\w*|sanitiz\w*|zod|joi|yup|pydantic|class-validator)\b/i;

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const carriesBody = (step: Step): boolean =>
  step.payloads.some((p) => p.part === 'body') ||
  ['POST', 'PUT', 'PATCH'].includes(step.http?.method ?? '');

const noValidator: Rule = {
  id: 'validation-missing',
  area: 'validation',
  title: 'A request with a body has no validator step',
  check(facts) {
    const incoming = facts.flow.steps.filter((s) => entersBackend(facts, s) && carriesBody(s));
    if (incoming.length === 0) return 'No request with a body enters the backend in this flow.';
    const checked = facts.flow.steps.some(
      (s) =>
        kindOf(facts, s.from) === 'validator' ||
        kindOf(facts, s.to) === 'validator' ||
        s.schema.length > 0 ||
        s.status?.code === 400 ||
        s.status?.code === 422 ||
        VALIDATION_WORDS.test(stepText(s)),
    );
    if (checked) return [];
    return incoming.map((s) => ({
      severity: 'medium',
      message: `${labelOf(s)} carries a body, and nothing in this flow validates it.`,
      steps: [s.idx],
    }));
  },
};

const AUTH_WORDS =
  /\b(auth\w*|session\w*|jwt|bearer|sign(ed)?[ -]?in|log(ged)?[ -]?in|login|permissions?|roles?|guards?|api[ -]?key|signature|hmac|csrf|requireUser)\b/i;

/** Paths that are open on purpose: signing in, callbacks, health checks. */
const PUBLIC_PATH =
  /\/(login|signin|sign-in|signup|sign-up|register|auth|oauth|token|password|forgot|reset|verify|webhooks?|callback|health|public)\b/i;

const PRIVATE_PATH = /\/(me|admin|account|accounts|private|profile|settings|billing|dashboard)\b/i;

function isProtectedRoute(step: Step): boolean {
  const http = step.http;
  if (!http || PUBLIC_PATH.test(http.path)) return false;
  return WRITE_METHODS.has(http.method) || PRIVATE_PATH.test(http.path);
}

const noAuth: Rule = {
  id: 'access-missing',
  area: 'access',
  title: 'A write or private route has no auth step',
  check(facts) {
    const routes = facts.flow.steps.filter((s) => entersBackend(facts, s) && isProtectedRoute(s));
    if (routes.length === 0) return 'No write or private route in this flow.';
    const guarded = facts.flow.steps.some(
      (s) =>
        s.status?.code === 401 ||
        s.status?.code === 403 ||
        AUTH_WORDS.test(stepText(s)) ||
        s.payloads.some((p) => p.part === 'cookies' || /authorization|cookie/i.test(p.text)) ||
        AUTH_WORDS.test(`${s.fromName} ${s.toName}`),
    );
    if (guarded) return [];
    return routes.map((s) => ({
      severity: 'high',
      message: `${labelOf(s)} changes or reads private data, and nothing in this flow checks who is calling.`,
      steps: [s.idx],
    }));
  },
};

export const REQUEST_RULES: readonly Rule[] = [noValidator, noAuth];
