import type { Step } from '@swv/core';

import { cx, isUrl } from '../../shared/lib/util.ts';
import { Chip } from '../../shared/ui/Chip.tsx';
import { TermText } from '../../shared/ui/TermText.tsx';
import styles from './card.module.css';
import { StepLinks } from './RichText.tsx';

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
    <span className={cx(styles.ref, 'mono')} title="Source">
      {value}
    </span>
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
