import * as Popover from '@radix-ui/react-popover';
import { useState, type ReactNode } from 'react';

import { cx } from '../lib/util.ts';
import { askAboutWord, startFollow } from '../state/follow.ts';
import { useGlossaryStore, type GlossaryEntry } from '../state/glossaryStore.ts';
import { useGlossary } from '../state/useGlossary.ts';
import { Button } from './Button.tsx';
import { Chip } from './Chip.tsx';
import styles from './TermText.module.css';

/** An underlined glossary word; clicking it shows the definition with Ask, Follow and Delete. */
export function TermPopover({
  entry,
  text,
  className,
}: {
  entry: GlossaryEntry;
  /** The word as written in the text, which may differ from the term in case. */
  text: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const remove = useGlossaryStore((s) => s.remove);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" className={cx(styles.term, className)} title={entry.def} data-term={entry.term}>
          {text}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={styles.termPop}
          sideOffset={6}
          collisionPadding={8}
          aria-label={`Term: ${entry.term}`}
          data-testid="term-pop"
        >
          <h4>
            {entry.term}
            {entry.source === 'saved' ? <Chip tone="marker">saved answer</Chip> : null}
          </h4>
          <p>{entry.def}</p>
          <div className={styles.termActs}>
            <Button
              onClick={() => {
                setOpen(false);
                askAboutWord(entry.term);
              }}
            >
              Ask AI more
            </Button>
            <Button
              onClick={() => {
                setOpen(false);
                startFollow(entry.term);
              }}
            >
              Follow in the flow
            </Button>
            {entry.source === 'saved' ? (
              <Button
                onClick={() => {
                  setOpen(false);
                  remove(entry.term);
                }}
              >
                Delete
              </Button>
            ) : null}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Prose with the glossary terms underlined; a click on one opens its definition. */
export function TermText({ text }: { text: string }) {
  const glossary = useGlossary();
  if (!glossary.regex) return <>{text}</>;
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(glossary.regex)) {
    const word = m[0];
    const entry = glossary.lookup(word);
    if (!entry) continue;
    out.push(text.slice(last, m.index));
    out.push(<TermPopover key={m.index} entry={entry} text={word} />);
    last = m.index + word.length;
  }
  out.push(text.slice(last));
  return <>{out}</>;
}
