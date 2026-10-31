import type { Step } from '@swv/core';

import { copyText } from '../../shared/lib/util.ts';
import { Chip } from '../../shared/ui/Chip.tsx';
import { toast } from '../../shared/ui/toast.ts';
import styles from './card.module.css';
import { cx } from './cx.ts';
import { StepLinks, TermText } from './RichText.tsx';
import { isUrl } from './steps.ts';

/** "Fields:" with each `@field` name and its text; "step 6" in the text is a link. */
export function FieldsRow({ step }: { step: Step }) {
  if (step.fields.length === 0) return null;
  return (
    <div className={styles.row} data-testid="fields">
      <b className={styles.label}>Fields:</b>
      {step.fields.map((f, i) => (
        <span key={i} className={styles.field}>
          <code>{f.name}</code> <StepLinks text={f.text} />
        </span>
      ))}
    </div>
  );
}

export function EffectsRow({ step }: { step: Step }) {
  if (step.effects.length === 0) return null;
  return (
    <div className={styles.row} data-testid="effects">
      <b className={styles.label}>Effects:</b>
      {step.effects.map((t, i) => (
        <Chip key={i} tone="ok">
          <TermText text={t} />
        </Chip>
      ))}
    </div>
  );
}

/** A `@ref`: a URL opens in a new tab; `path:line` copies itself on click. */
export function RefChip({ value }: { value: string }) {
  if (isUrl(value)) {
    return (
      <a className={cx(styles.ref, 'mono')} href={value} target="_blank" rel="noopener noreferrer">
        {value.replace(/^https?:\/\//i, '')}
      </a>
    );
  }
  return (
    <button
      type="button"
      className={cx(styles.ref, 'mono')}
      title="Source. Click to copy."
      onClick={() => {
        void copyText(value).then((ok) => {
          toast(ok ? `Copied ${value}` : 'Could not copy to the clipboard');
        });
      }}
    >
      {value}
    </button>
  );
}

export function RefsRow({ step }: { step: Step }) {
  if (step.refs.length === 0) return null;
  return (
    <>
      {step.refs.map((r) => (
        <RefChip key={r} value={r} />
      ))}
    </>
  );
}

/** `@threat` lines say "possible problem, please check", never that something is wrong. */
export function ThreatList({ step }: { step: Step }) {
  if (step.threats.length === 0) return null;
  return (
    <div className={styles.threats} data-testid="threats">
      {step.threats.map((threat, i) => (
        <div key={i}>
          <b>Possible problem, please check:</b> {threat.text}
        </div>
      ))}
    </div>
  );
}

export function UnconfirmedList({ step }: { step: Step }) {
  if (step.unconfirmed.length === 0) return null;
  return (
    <div className={styles.unc} data-testid="unconfirmed">
      {step.unconfirmed.map((t, i) => (
        <div key={i}>
          <b>Not confirmed:</b> {t}
        </div>
      ))}
    </div>
  );
}
