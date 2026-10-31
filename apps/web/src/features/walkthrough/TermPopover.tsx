import * as Popover from '@radix-ui/react-popover';
import { useState } from 'react';

import { useGlossaryStore, type GlossaryEntry } from '../../shared/state/glossaryStore.ts';
import { Button } from '../../shared/ui/Button.tsx';
import { Chip } from '../../shared/ui/Chip.tsx';
import styles from './card.module.css';
import { cx } from './cx.ts';
import { askAbout, startFollow } from './follow.ts';

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
        <Popover.Content className={styles.termPop} sideOffset={6} collisionPadding={8} aria-label={`Term: ${entry.term}`}>
          <h4>
            {entry.term}
            {entry.source === 'saved' ? <Chip tone="marker">saved answer</Chip> : null}
          </h4>
          <p>{entry.def}</p>
          <div className={styles.termActs}>
            <Button
              className={styles.ibtn}
              onClick={() => {
                setOpen(false);
                askAbout(`Tell me more about "${entry.term}"`);
              }}
            >
              Ask AI more
            </Button>
            <Button
              className={styles.ibtn}
              onClick={() => {
                setOpen(false);
                startFollow(entry.term);
              }}
            >
              Follow in the flow
            </Button>
            {entry.source === 'saved' ? (
              <Button
                className={styles.ibtn}
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
