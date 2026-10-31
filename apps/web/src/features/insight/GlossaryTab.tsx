import type { Flow } from '@swv/core';
import { useMemo, useState, type SyntheticEvent } from 'react';

import { allTerms, useGlossaryStore, type GlossaryEntry } from '../../shared/state/glossaryStore.ts';
import { Button } from '../../shared/ui/Button.tsx';
import { Chip } from '../../shared/ui/Chip.tsx';
import { toast } from '../../shared/ui/toast.ts';
import styles from './insight.module.css';

function SavedEntry({ entry }: { entry: GlossaryEntry }) {
  const add = useGlossaryStore((s) => s.add);
  const remove = useGlossaryStore((s) => s.remove);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.def);

  const save = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    add(entry.term, draft);
    setEditing(false);
  };

  if (editing) {
    return (
      <form className={styles.glEdit} onSubmit={save}>
        <input
          aria-label={`Definition of ${entry.term}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          required
        />
        <Button type="submit" variant="primary">
          Save
        </Button>
        <Button onClick={() => setEditing(false)}>Cancel</Button>
      </form>
    );
  }
  return (
    <>
      {entry.def}
      <div className={styles.glAct}>
        <Button
          onClick={() => {
            setDraft(entry.def);
            setEditing(true);
          }}
        >
          Edit
        </Button>
        <Button onClick={() => remove(entry.term)}>Delete</Button>
      </div>
    </>
  );
}

/** The `@term` lines of the code plus the terms saved in this browser, with a small add form. */
export function GlossaryTab({ flow }: { flow: Flow }) {
  const saved = useGlossaryStore((s) => s.saved);
  const add = useGlossaryStore((s) => s.add);
  const terms = useMemo(() => allTerms(flow, saved), [flow, saved]);
  const [term, setTerm] = useState('');
  const [def, setDef] = useState('');

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    const word = term.trim();
    if (!word || !def.trim()) return;
    add(word, def);
    setTerm('');
    setDef('');
    toast(`“${word}” added to the glossary`);
  };

  return (
    <>
      {terms.length > 0 ? (
        <dl className={styles.gl}>
          {terms.map((entry) => (
            <div key={entry.term} className={styles.glRow} data-term={entry.term}>
              <dt>
                {entry.term}
                {entry.source === 'saved' ? <Chip>saved answer</Chip> : null}
              </dt>
              <dd>{entry.source === 'saved' ? <SavedEntry entry={entry} /> : entry.def}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className={styles.empty}>
          No terms yet. The skill writes <span className="mono">%% @term word: definition</span> lines;
          answers you save from Ask AI land here too.
        </p>
      )}
      <form className={styles.glAdd} id="glAdd" onSubmit={submit}>
        <input
          name="term"
          placeholder="Term"
          aria-label="Term"
          required
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        <input
          name="def"
          placeholder="Definition in one sentence"
          aria-label="Definition"
          required
          value={def}
          onChange={(e) => setDef(e.target.value)}
        />
        <Button type="submit">Add</Button>
      </form>
      <p className={styles.muted}>
        Saved terms stay in this browser. Underlined words on the cards open their definition.
      </p>
    </>
  );
}
