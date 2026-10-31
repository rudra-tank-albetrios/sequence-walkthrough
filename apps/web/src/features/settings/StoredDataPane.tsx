import { useState } from 'react';

import { plural } from '../../shared/lib/util.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { useGlossaryStore } from '../../shared/state/glossaryStore.ts';
import { useNotesStore } from '../../shared/state/notesStore.ts';
import { NOTES_PREFIX } from '../../shared/storage/notes.ts';
import { loadSettings, SETTINGS_KEY } from '../../shared/storage/settings.ts';
import { formatBytes, storedEntries } from '../../shared/storage/storedData.ts';
import { Store } from '../../shared/storage/store.ts';
import { Button } from '../../shared/ui/Button.tsx';
import styles from './settings.module.css';

/** Removes one stored thing, and its copy in memory so the next save does not write it back. */
function forget(key: string): void {
  Store.del(key);
  if (key === SETTINGS_KEY) useFlowStore.setState({ settings: loadSettings() });
  if (key === `${NOTES_PREFIX}${useNotesStore.getState().id}`) useNotesStore.setState({ data: {} });
  if (key === `swv:terms:${useGlossaryStore.getState().id}`) useGlossaryStore.setState({ saved: {} });
  // The Ask AI feature keeps its settings in memory: only a fresh start is sure to drop the keys.
  if (key === 'swv:ai') window.location.reload();
}

/** What the viewer keeps in this browser, what it costs, and a way to remove any of it. */
export function StoredDataPane() {
  const [entries, setEntries] = useState(storedEntries);
  const [confirmAll, setConfirmAll] = useState(false);
  const groups = [...new Set(entries.map((entry) => entry.group))];
  const total = entries.reduce((sum, entry) => sum + entry.bytes, 0);

  return (
    <div className={styles.pane} data-testid="stored-data">
      <p className={styles.intro}>
        All of this stays in this browser and is never sent anywhere. Removing something here cannot be undone.
      </p>
      {Store.ok ? null : (
        <p className={styles.warn}>Storage is blocked here, so everything lasts only for this session.</p>
      )}
      {entries.length === 0 ? <p className={styles.intro}>Nothing is stored in this browser yet.</p> : null}
      {groups.map((group) => (
        <section key={group} className={styles.block}>
          <h3 className={styles.heading}>{group}</h3>
          <ul className={styles.rows}>
            {entries
              .filter((entry) => entry.group === group)
              .map((entry) => (
                <li key={entry.key} data-key={entry.key}>
                  <span className={styles.rowName}>{entry.label}</span>
                  <span className={styles.rowSize}>
                    {entry.items === null ? '' : `${plural(entry.items, 'item')}, `}
                    {formatBytes(entry.bytes)}
                  </span>
                  <Button
                    aria-label={`Delete: ${entry.label}`}
                    onClick={() => {
                      forget(entry.key);
                      setEntries(storedEntries());
                    }}
                  >
                    Delete
                  </Button>
                </li>
              ))}
          </ul>
        </section>
      ))}
      {entries.length > 0 ? (
        <div className={styles.total}>
          <span>In total {formatBytes(total)}</span>
          <Button
            onClick={() => {
              if (!confirmAll) {
                setConfirmAll(true);
                return;
              }
              for (const entry of entries) Store.del(entry.key);
              window.location.reload();
            }}
          >
            {confirmAll ? 'Click again to delete everything' : 'Delete everything'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
