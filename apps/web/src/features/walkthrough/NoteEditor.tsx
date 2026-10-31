import type { Step } from '@swv/core';
import { useEffect, useMemo, useRef, useState } from 'react';

import { debounce } from '../../shared/lib/util.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { useNotesStore } from '../../shared/state/notesStore.ts';
import { Store } from '../../shared/storage/store.ts';
import styles from './card.module.css';

const storedNote = (key: string): string => useNotesStore.getState().data[key]?.note ?? '';

/** The inline note editor: saves as you type, on blur and on Esc (which also closes it). */
export function NoteEditor({ step }: { step: Step }) {
  const setNote = useNotesStore((s) => s.setNote);
  const setUi = useFlowStore((s) => s.setUi);
  const [text, setText] = useState(() => storedNote(step.key));
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const latest = useRef(text);

  useEffect(() => {
    latest.current = text;
  }, [text]);

  const save = useMemo(
    () =>
      debounce((value: string) => {
        if (value !== storedNote(step.key)) setNote(step, value);
      }, 300),
    [step, setNote],
  );

  const flush = () => {
    save.cancel();
    if (latest.current !== storedNote(step.key)) setNote(step, latest.current);
  };

  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }, []);

  // Moving to another step or pressing N closes the editor: keep what was typed.
  useEffect(
    () => () => {
      save.cancel();
      if (latest.current !== storedNote(step.key)) setNote(step, latest.current);
    },
    [save, setNote, step],
  );

  return (
    <div className={styles.noteEdit}>
      <textarea
        ref={ref}
        aria-label={`Your note for step ${step.n}`}
        placeholder="Your note (only in this browser)"
        value={text}
        data-testid="note-ta"
        onChange={(e) => {
          setText(e.target.value);
          save(e.target.value);
        }}
        onBlur={flush}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          e.preventDefault();
          e.stopPropagation();
          flush();
          setUi({ noteOpen: false });
        }}
      />
      <span className={styles.hint}>
        Saved as you type. Only in this browser{Store.ok ? '' : ' (storage is blocked, so only for this session)'}.
      </span>
    </div>
  );
}

/** The saved note under the card, or the editor while it is open. */
export function NoteBlock({ step }: { step: Step }) {
  const open = useFlowStore((s) => s.ui.noteOpen);
  const note = useNotesStore((s) => s.data[step.key]?.note ?? '');
  if (open) return <NoteEditor step={step} />;
  if (!note.trim()) return null;
  return (
    <div className={styles.noteView} data-testid="note-view">
      <b>Your note:</b> {note}
    </div>
  );
}
