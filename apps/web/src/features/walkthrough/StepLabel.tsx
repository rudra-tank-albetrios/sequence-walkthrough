import { STATUS_RE, STATUS_TEXT, type Flow, type Step } from '@swv/core';
import { Fragment } from 'react';

import { useFlowStore } from '../../shared/state/flowStore.ts';
import { Chip } from '../../shared/ui/Chip.tsx';
import styles from './card.module.css';
import { cx } from './cx.ts';
import { TokenText } from './RichText.tsx';
import { statusFamily } from './steps.ts';

/** "From ──► To" (or "From ↻ itself"), the kind chip, and on a reply the link to its request. */
export function RouteLine({ flow, step }: { flow: Flow; step: Step }) {
  const go = useFlowStore((s) => s.go);
  const request = step.kind === 'reply' && step.answers >= 0 ? flow.steps[step.answers] : undefined;
  const kindClass = step.kind === 'reply' ? styles.kReply : step.kind === 'self' ? styles.kSelf : undefined;
  return (
    <div className={styles.route}>
      <span>{step.fromName}</span>
      {step.kind === 'self' ? (
        <span className={styles.arrow}>↻ itself</span>
      ) : (
        <>
          <span className={styles.arrow} aria-hidden="true">
            ──►
          </span>
          <span className="sr-only">to</span>
          <span>{step.toName}</span>
        </>
      )}
      <Chip className={kindClass}>{step.kind}</Chip>
      {request ? (
        <Chip tone="follow" title={`Go to step ${request.n}`} data-testid="pair-chip" onClick={() => go(request.idx)}>
          answers step {request.n}: {request.label[0]}
        </Chip>
      ) : null}
    </div>
  );
}

/** The first line of a reply: the status code coloured by family, with its general meaning. */
function StatusLine({ step, line }: { step: Step; line: string }) {
  const m = STATUS_RE.exec(line);
  if (!m || !step.status) return <TokenText text={line} />;
  const text = STATUS_TEXT[step.status.code] ?? '';
  return (
    <>
      <span className={cx(styles.status, styles[statusFamily(step)])} title={text} data-testid="status">
        {m[1] ?? ''}
      </span>{' '}
      <TokenText text={m[2] ?? ''} />
    </>
  );
}

/** What the arrow sends, line by line in monospace, plus the status note under a reply. */
export function StepLabel({ step }: { step: Step }) {
  const statusText = step.status ? STATUS_TEXT[step.status.code] : undefined;
  return (
    <>
      <div className={styles.sends} aria-label="What it sends">
        {step.label.map((line, i) => (
          <Fragment key={i}>
            {i > 0 ? <br /> : null}
            <span className={styles.mk}>
              {i === 0 && step.status ? <StatusLine step={step} line={line} /> : <TokenText text={line} />}
            </span>
          </Fragment>
        ))}
      </div>
      {statusText ? (
        <p className={styles.statusNote} data-testid="status-note">
          {statusText}
        </p>
      ) : null}
    </>
  );
}
