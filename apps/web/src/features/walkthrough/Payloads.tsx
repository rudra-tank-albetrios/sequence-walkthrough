import { PART_LABEL, type Step } from '@swv/core';

import styles from './card.module.css';
import { TokenText } from './RichText.tsx';
import { TermText } from '../../shared/ui/TermText.tsx';

/** The payload parts as labelled boxes, behind "Show payload". */
export function PayloadBox({ step }: { step: Step }) {
  if (step.payloads.length === 0) return null;
  return (
    // Keyed by step so the box starts closed on every step, as version 2's re-drawn card did.
    <details key={step.idx} data-testid="payload">
      <summary>Show payload</summary>
      {step.payloads.map((p, i) => (
        <div key={i} className={styles.plPart}>
          <span className={styles.plH}>{PART_LABEL[p.part]}</span>
          <pre className={styles.pre}>
            <TokenText text={p.text} />
          </pre>
        </div>
      ))}
    </details>
  );
}

/** The `@schema` rules as a two-column table. */
export function SchemaBox({ step }: { step: Step }) {
  if (step.schema.length === 0) return null;
  return (
    <details key={step.idx}>
      <summary>Schema ({step.schema.length})</summary>
      <table className={styles.mini}>
        <tbody>
          {step.schema.map((r, i) => (
            <tr key={i}>
              <td className="mono">{r.field}</td>
              <td>
                <TermText text={r.text} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** `@state before` and `@state after` side by side. */
export function StateBox({ step }: { step: Step }) {
  if (!step.state.before && !step.state.after) return null;
  return (
    <div className={styles.state} data-testid="state">
      <div>
        <b className={styles.label}>Before</b>
        <pre className={styles.pre}>{step.state.before || '—'}</pre>
      </div>
      <div>
        <b className={styles.label}>After</b>
        <pre className={styles.pre}>{step.state.after || '—'}</pre>
      </div>
    </div>
  );
}
