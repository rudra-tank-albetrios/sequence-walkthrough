import * as Popover from '@radix-ui/react-popover';
import type { Flow } from '@swv/core';
import { useRef, useState } from 'react';

import { plural } from '../../shared/lib/util.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { useNotesStore } from '../../shared/state/notesStore.ts';
import { route, touchEntry, type NotesData } from '../../shared/storage/notes.ts';
import { Store } from '../../shared/storage/store.ts';
import { Button } from '../../shared/ui/Button.tsx';
import { Chip } from '../../shared/ui/Chip.tsx';
import { Kbd } from '../../shared/ui/Kbd.tsx';
import { toast } from '../../shared/ui/toast.ts';
import { exportNotes, importNotes } from './notesFile.ts';
import styles from './walkbar.module.css';

/** "★ N": the bookmarked and noted steps, notes whose step changed, export and import. */
export function BookmarksPopover({ flow }: { flow: Flow }) {
  const [open, setOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cur = useFlowStore((s) => s.cur);
  const go = useFlowStore((s) => s.go);
  const id = useNotesStore((s) => s.id);
  const data = useNotesStore((s) => s.data);
  const remove = useNotesStore((s) => s.remove);
  const replaceAll = useNotesStore((s) => s.replaceAll);

  const keys = new Set(flow.steps.map((s) => s.key));
  const items = flow.steps.filter((s) => {
    const e = data[s.key];
    return e && (e.star || e.note.trim());
  });
  const orphans = Object.entries(data).filter(([k]) => !keys.has(k));
  const stars = Object.values(data).filter((e) => e.star).length;
  const current = flow.steps[cur];

  const attach = (oldKey: string) => {
    const old = data[oldKey];
    if (!old || !current) return;
    const next: NotesData = { ...data };
    const entry = touchEntry(next, current);
    entry.star = entry.star || old.star;
    entry.note = [entry.note, old.note].filter((t) => t.trim()).join('\n');
    const { [oldKey]: _gone, ...rest } = next;
    replaceAll(rest);
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    void file.text().then(
      (text) => {
        try {
          const result = importNotes(text, useNotesStore.getState().data);
          replaceAll(result.data);
          toast(`Imported ${plural(result.count, 'note')}`);
        } catch (err) {
          toast(`Could not import notes: ${err instanceof Error ? err.message : String(err)}`);
        }
      },
      () => {
        toast('Could not import notes: the file could not be read');
      },
    );
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setConfirmClear(false);
      }}
    >
      <Popover.Trigger asChild>
        <Button variant="ghost" className={styles.bm} title="Bookmarks and notes" data-testid="bm-btn">
          ★ {stars}
          <span className="sr-only"> bookmarks</span>
          {orphans.length > 0 ? <Chip title="Notes for steps that changed">{orphans.length} changed</Chip> : null}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className={styles.pop} align="end" sideOffset={6} collisionPadding={8} aria-label="Bookmarks and notes">
          <h3>Bookmarks and notes</h3>
          {items.length > 0 ? (
            <ul>
              {items.map((s) => {
                const e = data[s.key];
                return (
                  <li key={s.key}>
                    <button
                      type="button"
                      className={styles.go}
                      onClick={() => {
                        go(s.idx);
                        setOpen(false);
                      }}
                    >
                      <span className={styles.bmN}>
                        {e?.star ? '★' : '✎'} {s.n}
                      </span>{' '}
                      · {route(s)}
                      <span className={styles.bmNote}>{e?.note.trim() ? e.note : s.label.join(' ')}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className={styles.empty}>
              No bookmarks yet. Press <Kbd>B</Kbd> on a step to star it, or <Kbd>N</Kbd> to write a note.
            </div>
          )}
          {orphans.length > 0 ? (
            <>
              <h3>Notes for changed steps</h3>
              <ul>
                {orphans.map(([k, e]) => (
                  <li key={k} className={styles.orphan}>
                    <div>
                      <b>{e.route ?? ''}</b> · {e.label ?? ''}
                      <span className={styles.bmNote}>
                        {e.star ? '★ ' : ''}
                        {e.note}
                      </span>
                    </div>
                    {current ? (
                      <Button className={styles.small} title={`Move to step ${current.n}`} onClick={() => attach(k)}>
                        Move to step {current.n}
                      </Button>
                    ) : null}
                    <Button className={styles.small} aria-label="Delete this note" onClick={() => remove(k)}>
                      Delete
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {Store.ok ? null : (
            <div className={styles.empty}>
              Storage is blocked here, so notes last only for this session. Export them to keep them.
            </div>
          )}
          <div className={styles.popRow}>
            <Button className={styles.small} onClick={() => void exportNotes(flow, id, data)}>
              Export notes
            </Button>
            <Button className={styles.small} onClick={() => fileRef.current?.click()}>
              Import notes
            </Button>
            {Object.keys(data).length > 0 ? (
              <Button
                className={styles.small}
                onClick={() => {
                  if (confirmClear) {
                    replaceAll({});
                    setConfirmClear(false);
                  } else setConfirmClear(true);
                }}
              >
                {confirmClear ? 'Click again to delete all' : 'Delete all'}
              </Button>
            ) : null}
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              hidden
              aria-label="Notes file"
              onChange={(e) => {
                onFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
