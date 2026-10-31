import { bodyText, payloadDiff, type Flow, type Step } from '@swv/core';

import { cx } from '../../shared/lib/util.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { Chip } from '../../shared/ui/Chip.tsx';
import styles from './card.module.css';
import { statusFamily } from './steps.ts';

/** On a request: every reply as a status chip that jumps to it; an HTTP request with none says so. */
export function RepliesList({ flow, step }: { flow: Flow; step: Step }) {
  const go = useFlowStore((s) => s.go);
  if (step.kind !== 'request') return null;
  if (step.replies.length === 0) {
    return step.http ? (
      <div className={cx(styles.replies, styles.none)}>No reply arrow for this request yet.</div>
    ) : null;
  }
  return (
    <div className={styles.replies} data-testid="replies">
      <b>{step.replies.length === 1 ? 'Reply' : 'Replies'}:</b>
      {step.replies.map((i) => {
        const reply = flow.steps[i];
        if (!reply) return null;
        const branch = reply.branch.at(-1)?.label ?? '';
        return (
          <Chip
            key={i}
            className={cx(styles.st, styles[statusFamily(reply)])}
            title={`Go to step ${reply.n}`}
            onClick={() => go(i)}
          >
            {reply.label[0]}
            <span className={styles.stN}>
              step {reply.n}
              {branch ? ` · ${branch}` : ''}
            </span>
          </Chip>
        );
      })}
    </div>
  );
}

/** On a reply whose body and request body are both JSON objects: the top-level keys that differ. */
export function PayloadDiffBox({ flow, step }: { flow: Flow; step: Step }) {
  const request = step.answers >= 0 ? flow.steps[step.answers] : undefined;
  if (!request) return null;
  const diff = payloadDiff(bodyText(request), bodyText(step));
  if (!diff || (diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0)) return null;
  return (
    <div className={styles.diff} data-testid="diff">
      <b>Compared with the request body:</b>{' '}
      {diff.added.map((k) => (
        <span key={`+${k}`} className={styles.dAdd}>
          + {k}{' '}
        </span>
      ))}
      {diff.changed.map((k) => (
        <span key={`~${k}`} className={styles.dChg}>
          ~ {k}{' '}
        </span>
      ))}
      {diff.removed.map((k) => (
        <span key={`-${k}`} className={styles.dDel}>
          − {k}{' '}
        </span>
      ))}
    </div>
  );
}
