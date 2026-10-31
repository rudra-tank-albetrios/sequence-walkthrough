import styles from './export.module.css';
import { useExportUi } from './exportUi.ts';
import { DROP_HINT } from './importer.ts';

/** Covers the page while files are dragged over it. State comes from `useDropImport`. */
export function DropScrim() {
  const dragging = useExportUi((s) => s.dragging);
  if (!dragging) return null;
  return (
    <div className={styles.dropScrim} data-testid="drop-scrim">
      <div>{DROP_HINT}</div>
    </div>
  );
}
