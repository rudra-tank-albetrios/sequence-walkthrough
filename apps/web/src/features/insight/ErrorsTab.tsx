import type { Flow, Step } from '@swv/core';
import { Fragment } from 'react';

import { Chip } from '../../shared/ui/Chip.tsx';
import { TermText } from '../../shared/ui/TermText.tsx';
import styles from './insight.module.css';
import { StatusChip, StepLink } from './StepLink.tsx';

/** Every 4xx and 5xx reply with its message, branch and cause, then the unconfirmed details. */
export function ErrorsTab({ flow, steps }: { flow: Flow; steps: Step[] }) {
  const errors = steps.filter((s) => s.isError);
  const unconfirmed = steps.filter((s) => s.unconfirmed.length > 0);
  return (
    <>
      {errors.length > 0 ? (
        <table className={styles.it}>
          <thead>
            <tr>
              <th scope="col">Status</th>
              <th scope="col">Message</th>
              <th scope="col">When</th>
              <th scope="col">Cause</th>
            </tr>
          </thead>
          <tbody>
            {errors.map((s) => (
              <tr key={s.idx} data-error-step={s.idx}>
                <td>
                  <StatusChip index={s.idx} codeOnly />
                </td>
                <td>
                  {[s.status?.reason ?? '', ...s.label.slice(1)].filter(Boolean).join(' ')}
                  <div className={styles.ilMeta}>
                    <StepLink index={s.idx} /> · {s.fromName} → {s.toName}
                    {s.answers >= 0 ? (
                      <>
                        {' '}
                        · answers <StepLink index={s.answers} />
                      </>
                    ) : null}
                  </div>
                </td>
                <td>
                  {s.branch.length > 0 ? (
                    s.branch.map((b) => (
                      <Chip key={`${b.id}-${b.kind}`} className={styles.br}>
                        <b>{b.kind}</b> {b.label}
                      </Chip>
                    ))
                  ) : (
                    <span className={styles.muted}>always</span>
                  )}
                </td>
                <td>
                  <TermText text={s.explain} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className={styles.empty}>No reply with a 4xx or 5xx status in this flow.</p>
      )}
      {unconfirmed.length > 0 ? (
        <>
          <h3>Not confirmed from the code</h3>
          <ul className={styles.il}>
            {unconfirmed.map((s) => (
              <li key={s.idx}>
                <StepLink index={s.idx} />{' '}
                {s.unconfirmed.map((text, i) => (
                  <Fragment key={i}>
                    {i > 0 ? <br /> : null}
                    {text}
                  </Fragment>
                ))}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {flow.proposed ? (
        <p className={styles.warnLine}>
          <b>Proposed design:</b> none of these steps exist in the code yet.
        </p>
      ) : null}
    </>
  );
}
