import { FLAG_TAGS, PART_LABEL, STATUS_TEXT, type Flow, type Step } from '@swv/core';

import type { NoteEntry } from '../../shared/storage/notes.ts';
import { route } from '../../shared/storage/notes.ts';
import styles from './viewer.module.css';

const cut = (text: string, n: number): string => {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

const statusClass = (step: Step): string =>
  step.status ? `s${Math.floor(step.status.code / 100)}xx` : '';

/** Hovering an arrow: what the label does not say, so the step bar is only needed for the detail. */
export function StepTooltip({
  flow,
  step,
  note,
  current,
}: {
  flow: Flow;
  step: Step;
  note: NoteEntry | undefined;
  current: boolean;
}) {
  const section = flow.sections[step.section];
  const flags = FLAG_TAGS.filter((k) => step.flags[k]).map((k) => {
    const v = step.flags[k];
    return typeof v === 'string' ? `${k}: ${cut(v, 60)}` : k;
  });
  const statusText = step.status ? STATUS_TEXT[step.status.code] : undefined;
  return (
    <>
      <div className={styles.tipHead}>
        <b>Step {step.n}</b>
        {section ? (
          <span className={styles.tipChapter} style={{ ['--ch' as string]: section.hue }}>
            {section.name}
          </span>
        ) : null}{' '}
        <span className={styles.tipKind}>{step.kind}</span>
        <span className={styles.tipRoute}>{route(step)}</span>
      </div>
      <div className={styles.tipDoes}>
        {step.explain ? cut(step.explain, 240) : <span className={styles.faint}>No explanation yet</span>}
      </div>
      {step.status && statusText ? (
        <div className={styles.tipRow}>
          <b className={styles[statusClass(step)]}>{step.status.code}</b> {statusText}
        </div>
      ) : null}
      {step.kind === 'request' && step.replies.length > 0 ? (
        <div className={styles.tipRow}>
          <b>Replies</b>{' '}
          {step.replies.map((j) => `${flow.steps[j]?.label[0] ?? ''} (step ${j + 1})`).join(' · ')}
        </div>
      ) : null}
      {step.kind === 'reply' && step.answers >= 0 ? (
        <div className={styles.tipRow}>
          <b>Answers</b> step {step.answers + 1}: {flow.steps[step.answers]?.label[0] ?? ''}
        </div>
      ) : null}
      {step.payloads.slice(0, 3).map((p, i) => (
        <div className={styles.tipRow} key={i}>
          <b>{PART_LABEL[p.part]}</b> <span className="mono">{cut(p.text, 110)}</span>
        </div>
      ))}
      {step.payloads.length > 3 ? (
        <div className={`${styles.tipRow} ${styles.faint}`}>
          + {step.payloads.length - 3} more payload part{step.payloads.length - 3 === 1 ? '' : 's'}
        </div>
      ) : null}
      {step.uses.length > 0 ? (
        <div className={styles.tipRow}>
          <b>Also involved</b> {step.uses.map((u) => `${u.kind} ${u.name}`).join(', ')}
        </div>
      ) : null}
      {step.effects.length > 0 ? (
        <div className={styles.tipRow}>
          <b>Effects</b> {cut(step.effects.join('; '), 140)}
        </div>
      ) : null}
      {flags.length > 0 ? (
        <div className={styles.tipRow}>
          <b>Chips</b> {flags.join(' · ')}
        </div>
      ) : null}
      {step.unconfirmed.length > 0 ? (
        <div className={`${styles.tipRow} ${styles.tipUnconfirmed}`}>
          <b>Unconfirmed</b> {cut(step.unconfirmed.join('; '), 140)}
        </div>
      ) : null}
      {step.refs.length > 0 ? (
        <div className={styles.tipRow}>
          <b>Code</b> <span className="mono">{step.refs.join(' ')}</span>
        </div>
      ) : null}
      {note?.note ? (
        <div className={styles.tipRow}>
          <b>Your note</b> {cut(note.note, 120)}
        </div>
      ) : null}
      <div className={styles.tipFoot}>Click the arrow for the full card{current ? ' (current step)' : ''}</div>
    </>
  );
}

export function LayerTooltip({ flow, alias }: { flow: Flow; alias: string }) {
  const layer = flow.layers[alias];
  if (!layer) return null;
  return (
    <>
      <b>
        {layer.icon ? `${layer.icon} ` : ''}
        {layer.name}
        {layer.kind ? <span className={styles.tipKind}> {layer.kind}</span> : null}
      </b>
      {layer.desc ? layer.desc : <span className={styles.faint}>No @layer description yet</span>}
      <div className={styles.tipFoot}>Click to show only its arrows</div>
    </>
  );
}
