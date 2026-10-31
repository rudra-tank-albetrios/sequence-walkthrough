import type { Step } from '../types.ts';
import {
  kindOf,
  labelOf,
  payloadText,
  repliesToCaller,
  stepText,
  zoneOf,
  type Facts,
} from './facts.ts';
import type { Rule, RuleFinding } from './rule.ts';

/** Words that mark a reply or an explanation as being about something going wrong. */
const FAILURE_WORDS =
  /\b(errors?|fail(s|ed|ure)?|denied|invalid|reject(s|ed)?|unauthori[sz]ed|forbidden|not found|time[sd]?[ -]?out|conflict|expired|exception|declined|retr(y|ies|ied))\b/i;

const READ_WORDS = /\b(find\w*|get\w*|select|read\w*|load\w*|fetch\w*|lookup|query|exists)\b/i;
const DATA_HOLDERS = new Set(['service', 'repository', 'db', 'cache']);

/**
 * A reply is drawn only when a real value comes back, so a write with no reply is normal. The calls
 * that must have one: HTTP calls, calls outside the project, and reads, which exist for their answer.
 */
function replyExpected(facts: Facts, step: Step): RuleFinding['severity'] | null {
  if (step.kind !== 'request' || step.flags.async || step.replies.length > 0) return null;
  if (kindOf(facts, step.from) === 'person') return null;
  if (step.http && zoneOf(facts, step.to) !== 'client') return 'medium';
  if (zoneOf(facts, step.to) === 'outside') return 'low';
  const read = DATA_HOLDERS.has(kindOf(facts, step.to)) && READ_WORDS.test(step.label.join(' '));
  return read ? 'low' : null;
}

const noReply: Rule = {
  id: 'reply-missing',
  area: 'replies',
  title: 'A call has no reply',
  check(facts) {
    const found: RuleFinding[] = [];
    for (const step of facts.flow.steps) {
      const severity = replyExpected(facts, step);
      if (severity) {
        found.push({
          severity,
          message: `${labelOf(step)}: no reply from ${step.toName} in this flow.`,
          steps: [step.idx],
        });
      }
    }
    return found;
  },
};

const errorWithoutStatus: Rule = {
  id: 'error-no-status',
  area: 'replies',
  title: 'An error reply has no status',
  check(facts) {
    return facts.flow.steps
      .filter(
        (s) =>
          repliesToCaller(facts, s) && s.status === null && FAILURE_WORDS.test(s.label.join(' ')),
      )
      .map((s) => ({
        severity: 'medium',
        message: `${labelOf(s)} looks like an error, but it names no status code.`,
        steps: [s.idx],
      }));
  },
};

const skipsSerializer: Rule = {
  id: 'reply-skips-serializer',
  area: 'replies',
  title: 'A response skips the serializer this flow has',
  check(facts) {
    if (!facts.present.has('serializer')) return 'This flow has no serializer layer.';
    const { steps, main } = facts.flow;
    const touches = (s: Step) =>
      kindOf(facts, s.from) === 'serializer' || kindOf(facts, s.to) === 'serializer';
    return steps
      .filter((s) => s.kind === 'reply' && repliesToCaller(facts, s) && isSuccess(s))
      .filter((s) => !steps.slice(Math.max(main, 0), s.idx).some(touches))
      .map((s) => ({
        severity: 'medium',
        message: `${labelOf(s)} goes out without passing through the serializer.`,
        steps: [s.idx],
      }));
  },
};

const isSuccess = (step: Step): boolean =>
  step.status !== null && step.status.code >= 200 && step.status.code < 300;

/** The steps after an outside call, up to the next outside call. */
function stepsAfterCall(facts: Facts, step: Step): Step[] {
  const rest = facts.flow.steps.slice(step.idx + 1);
  const next = rest.findIndex((s) => s.kind === 'request' && zoneOf(facts, s.to) === 'outside');
  return next < 0 ? rest : rest.slice(0, next);
}

const outsideWithoutFailure: Rule = {
  id: 'outside-no-failure',
  area: 'reliability',
  title: 'An outside call has no failure path',
  check(facts) {
    const calls = facts.flow.steps.filter(
      (s) =>
        s.kind === 'request' &&
        zoneOf(facts, s.to) === 'outside' &&
        kindOf(facts, s.from) !== 'person',
    );
    if (calls.length === 0) return 'This flow calls nothing outside the project.';
    return calls
      .filter((call) => {
        if (call.flags.retry || call.flags.timeout || FAILURE_WORDS.test(call.explain))
          return false;
        return !stepsAfterCall(facts, call).some(
          (s) =>
            s.inElse ||
            s.isError ||
            s.branch.some((b) => b.kind === 'break' || b.kind === 'option') ||
            FAILURE_WORDS.test(stepText(s)),
        );
      })
      .map((call) => ({
        severity: 'medium',
        message: `${call.fromName} calls ${call.toName}, and this flow does not show what happens when that fails.`,
        steps: [call.idx],
      }));
  },
};

const WRITE_WORDS =
  /\b(insert|update|delete|upsert|merge|save[sd]?|create[sd]?|write[sn]?|persist(s|ed)?|store[sd]?|remove[sd]?)\b/i;

/** Words that show the writes succeed or fail together, or can safely be run again. */
const ATOMIC_WORDS =
  /\b(transactions?|transactional|atomic(ally)?|rollback|roll back|rolled back|commit|begin|saga|outbox|compensat\w*|idempoten\w*)\b/i;

/** The writes of one chapter: separate chapters are separate moments of the flow. */
function writesTogether(writes: readonly Step[]): Step[] {
  const bySection = new Map<number, Step[]>();
  for (const step of writes) {
    bySection.set(step.section, [...(bySection.get(step.section) ?? []), step]);
  }
  return [...bySection.values()].find((group) => group.length >= 2) ?? [];
}

const halfSaved: Rule = {
  id: 'half-saved',
  area: 'reliability',
  title: 'Data can be left half saved',
  check(facts) {
    const store = facts.present.has('db') ? 'db' : 'repository';
    const writes = writesTogether(
      facts.flow.steps.filter(
        (s) =>
          s.kind === 'request' &&
          kindOf(facts, s.to) === store &&
          WRITE_WORDS.test(`${s.label.join(' ')} ${payloadText(s)}`),
      ),
    );
    if (writes.length < 2) return 'This flow has no chapter with two separate writes.';
    const atomic = facts.flow.steps.some(
      (s) =>
        s.flags.idempotent !== undefined ||
        s.branch.some((b) => b.kind === 'critical') ||
        ATOMIC_WORDS.test(`${stepText(s)} ${payloadText(s)}`),
    );
    if (atomic) return [];
    return [
      {
        severity: 'medium',
        message: `This flow writes ${writes.length} times with no transaction, so a failure part-way can leave data half saved.`,
        steps: writes.map((s) => s.idx),
      },
    ];
  },
};

export const REPLY_RULES: readonly Rule[] = [noReply, errorWithoutStatus, skipsSerializer];
export const RELIABILITY_RULES: readonly Rule[] = [outsideWithoutFailure, halfSaved];
