import { Fragment } from 'react';

import { plural } from '../../shared/lib/util.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { useNotesStore } from '../../shared/state/notesStore.ts';
import { route } from '../../shared/storage/notes.ts';
import { Chip } from '../../shared/ui/Chip.tsx';
import styles from './presenter.module.css';

/** Presenter mode: one large card with the step, its label, explanation and your note. */
export function PresenterCard() {
  const on = useFlowStore((s) => s.ui.presenter);
  const flow = useFlowStore((s) => s.flow);
  const cur = useFlowStore((s) => s.cur);
  const step = flow?.steps[cur];
  const note = useNotesStore((s) => (step ? s.data[step.key]?.note : undefined));
  if (!on || !flow?.isSequence) return null;
  const section = step ? flow.sections[step.section] : undefined;
  return (
    <section className={styles.card} aria-live="polite" aria-atomic="true" aria-label="Presenter card" data-testid="present-card">
      {step ? (
        <>
          <div className={styles.top}>
            <span>
              Step {step.n} of {flow.steps.length}
            </span>
            {section ? (
              <Chip tone="chapter" hue={section.hue}>
                {section.name}
              </Chip>
            ) : null}
          </div>
          <div className={styles.route}>{route(step)}</div>
          <div className={styles.sends}>
            {step.label.map((line, i) => (
              <Fragment key={i}>
                {i > 0 ? <br /> : null}
                {line}
              </Fragment>
            ))}
          </div>
          <p className={styles.does}>{step.explain}</p>
          {note?.trim() ? (
            <div className={styles.note}>
              <b>Speaker note:</b> {note}
            </div>
          ) : null}
        </>
      ) : (
        <>
          <h2>{flow.title}</h2>
          <p className={styles.muted}>{plural(flow.steps.length, 'step')}. Press → to start.</p>
        </>
      )}
    </section>
  );
}
