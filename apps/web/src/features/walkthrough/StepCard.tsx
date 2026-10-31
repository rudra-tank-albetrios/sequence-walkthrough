import type { Flow, Step } from '@swv/core';
import type { CSSProperties } from 'react';

import { cx } from '../../shared/lib/util.ts';
import { TermText } from '../../shared/ui/TermText.tsx';

import styles from './card.module.css';
import { NoteBlock } from './NoteEditor.tsx';
import { PayloadDiffBox, RepliesList } from './Pairing.tsx';
import { PayloadBox, SchemaBox, StateBox } from './Payloads.tsx';
import { EffectsRow, FieldsRow, RefsRow, UnconfirmedList } from './StepFacts.tsx';
import { StepHeader } from './StepHeader.tsx';
import { RouteLine, StepLabel } from './StepLabel.tsx';
import { UsesStrip } from './UsesStrip.tsx';

/** The `@step` text, or a muted fallback when the step has none. */
function Explanation({ step }: { step: Step }) {
  if (step.explain) {
    return (
      <p className={styles.does} data-testid="explain">
        <TermText text={step.explain} />
      </p>
    );
  }
  const who =
    step.kind === 'self' ? `${step.fromName} works on its own here` : `Sends this from ${step.fromName} to ${step.toName}`;
  return (
    <p className={cx(styles.does, styles.fallback)} data-testid="explain">
      {who}. No explanation yet.
    </p>
  );
}

/** The centre card for one step. */
export function StepCard({ flow, step }: { flow: Flow; step: Step }) {
  const section = flow.sections[step.section];
  const summary = section?.summary && step.idx === section.firstStep ? section : undefined;
  const hasExtra =
    step.payloads.length > 0 ||
    step.schema.length > 0 ||
    step.state.before ||
    step.state.after ||
    step.fields.length > 0 ||
    step.effects.length > 0 ||
    step.refs.length > 0 ||
    step.unconfirmed.length > 0 ||
    step.answers >= 0;
  return (
    <div data-testid="step-card">
      <StepHeader flow={flow} step={step} />
      <div className={styles.body}>
        <div className={styles.primary}>
          <RouteLine flow={flow} step={step} />
          <StepLabel step={step} />
          {summary ? (
            <p className={styles.summary} style={{ '--ch': summary.hue } as CSSProperties} data-testid="chapter-summary">
              <b>{summary.name}:</b> <TermText text={summary.summary} />
            </p>
          ) : null}
          <Explanation step={step} />
          <RepliesList flow={flow} step={step} />
        </div>
        <div className={styles.secondary}>
          {hasExtra ? (
            <div className={styles.extra}>
              <PayloadBox step={step} />
              <PayloadDiffBox flow={flow} step={step} />
              <SchemaBox step={step} />
              <StateBox step={step} />
              <FieldsRow step={step} />
              <EffectsRow step={step} />
              <RefsRow step={step} />
              <UnconfirmedList step={step} />
            </div>
          ) : null}
          <UsesStrip step={step} />
          <NoteBlock step={step} />
        </div>
      </div>
    </div>
  );
}
