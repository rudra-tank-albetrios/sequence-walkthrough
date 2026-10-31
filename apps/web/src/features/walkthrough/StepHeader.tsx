import { FLAG_TAGS, type Flow, type Step } from '@swv/core';
import { MessageCircleQuestion, Pencil, Star } from 'lucide-react';
import { useState } from 'react';

import { useFlowStore } from '../../shared/state/flowStore.ts';
import { useNotesStore } from '../../shared/state/notesStore.ts';
import { Button } from '../../shared/ui/Button.tsx';
import { Chip } from '../../shared/ui/Chip.tsx';
import styles from './card.module.css';

/** "Step [n] of N": Enter jumps to the typed step, Esc restores the number. */
function StepInput({ n, total }: { n: number; total: number }) {
  const go = useFlowStore((s) => s.go);
  const [value, setValue] = useState(String(n));
  return (
    <input
      className={styles.stepInput}
      type="text"
      inputMode="numeric"
      value={value}
      aria-label="Step number, type to jump"
      onChange={(e) => {
        setValue(e.target.value);
      }}
      onFocus={(e) => {
        e.target.select();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          const v = Number.parseInt(value, 10);
          if (v >= 1) {
            go(Math.min(v, total) - 1);
            setValue(String(Math.min(v, total)));
          } else setValue(String(n));
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setValue(String(n));
          e.currentTarget.blur();
        }
      }}
    />
  );
}

/** The first row of the step card: count, chapter, branches, flags, unconfirmed, and the actions. */
export function StepHeader({ flow, step }: { flow: Flow; step: Step }) {
  const noteOpen = useFlowStore((s) => s.ui.noteOpen);
  const setUi = useFlowStore((s) => s.setUi);
  const starred = useNotesStore((s) => s.data[step.key]?.star ?? false);
  const toggleStar = useNotesStore((s) => s.toggleStar);
  const section = flow.sections[step.section];
  return (
    <div className={styles.top}>
      <span className={styles.count}>
        Step <StepInput key={step.n} n={step.n} total={flow.steps.length} /> of {flow.steps.length}
      </span>
      {section ? (
        <Chip tone="chapter" hue={section.hue} title={section.summary || section.name}>
          {step.idx - section.firstStep + 1} of {section.count} in <b>{section.name}</b>
        </Chip>
      ) : null}
      {step.branch.map((b) => (
        <Chip key={`${b.id}-${b.kind}`} className={styles.br} title={`${b.kind} ${b.label}`}>
          <b>{b.kind}</b> {b.label}
        </Chip>
      ))}
      {FLAG_TAGS.filter((k) => step.flags[k]).map((k) => {
        const value = step.flags[k];
        const text = typeof value === 'string' ? value : '';
        return (
          <Chip key={k} title={text || k}>
            {k}
            {text ? ` ${text}` : ''}
          </Chip>
        );
      })}
      {step.unconfirmed.map((t, i) => (
        <Chip key={i} tone="unconfirmed" title={t}>
          unconfirmed
        </Chip>
      ))}
      {flow.proposed ? (
        <Chip tone="unconfirmed" title="This flow is a design; this step does not exist in the code yet">
          proposed
        </Chip>
      ) : null}
      <span className={styles.spacer} />
      <Button
        className={styles.ask}
        title="Ask AI about this step (A)"
        data-tour="ask-ai"
        onClick={() => {
          setUi({ askOpen: true });
        }}
      >
        <MessageCircleQuestion size={15} aria-hidden="true" /> Ask AI
      </Button>
      <Button
        variant="ghost"
        icon
        className={styles.ibtn}
        pressed={starred}
        aria-label="Bookmark this step (B)"
        title="Bookmark (B)"
        data-testid="star-btn"
        onClick={() => {
          toggleStar(step);
        }}
      >
        <Star size={16} fill={starred ? 'currentColor' : 'none'} aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        icon
        className={styles.ibtn}
        pressed={noteOpen}
        aria-label="Write a note (N)"
        title="Note (N)"
        onClick={() => {
          setUi({ noteOpen: !noteOpen });
        }}
      >
        <Pencil size={15} aria-hidden="true" />
      </Button>
    </div>
  );
}
