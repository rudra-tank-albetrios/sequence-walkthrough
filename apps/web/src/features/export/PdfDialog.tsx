import { useMemo, useState } from 'react';

import { useDiagramStore } from '../../shared/state/diagramStore.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { Button } from '../../shared/ui/Button.tsx';
import { Dialog } from '../../shared/ui/Dialog.tsx';
import styles from './export.module.css';
import { exportName } from './files.ts';
import { exportPdf, run } from './exportActions.ts';
import { useExportUi } from './exportUi.ts';
import { liveGeometry, pdfPlan, type PaperSize } from './pdf.ts';

const TALL = 20;

/** Options for the PDF: table and notes at the end, paper size, with the page count up front. */
export function PdfDialog() {
  const open = useExportUi((s) => s.pdfOpen);
  const setOpen = useExportUi((s) => s.setPdfOpen);
  const title = useFlowStore((s) => s.flow?.title ?? 'Sequence diagram');
  const isSequence = useFlowStore((s) => s.flow?.isSequence ?? false);
  const width = useDiagramStore((s) => s.width);
  const height = useDiagramStore((s) => s.height);
  const [table, setTable] = useState(true);
  const [notes, setNotes] = useState(false);
  const [size, setSize] = useState<PaperSize>('a4');
  const pages = useMemo(
    () => (open ? pdfPlan(size, width, height, liveGeometry()).slices.length : 0),
    [open, size, width, height],
  );

  const download = () => {
    setOpen(false);
    run(() => exportPdf({ size, table: table && isSequence, notes }));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title="Download PDF"
      description="Landscape pages. The participant row is repeated at the top of every page."
      showDescription
      size="narrow"
      actions={
        <>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={download} disabled={width === 0}>
            Download {exportName(title, 'pdf')}
          </Button>
        </>
      }
    >
      <label className={styles.option}>
        <input type="checkbox" checked={table} disabled={!isSequence} onChange={(e) => setTable(e.target.checked)} />
        Add the step table at the end
      </label>
      <label className={styles.option}>
        <input type="checkbox" checked={notes} disabled={!isSequence} onChange={(e) => setNotes(e.target.checked)} />
        Include my notes
      </label>
      <label className={styles.option}>
        Paper
        <select value={size} onChange={(e) => setSize(e.target.value === 'letter' ? 'letter' : 'a4')}>
          <option value="a4">A4</option>
          <option value="letter">US Letter</option>
        </select>
      </label>
      <p className={styles.note}>
        {pages} diagram page{pages === 1 ? '' : 's'}.
      </p>
      {pages > TALL ? (
        <p className={styles.warn}>This is a tall diagram: {pages} pages. Consider a PNG instead.</p>
      ) : null}
    </Dialog>
  );
}
