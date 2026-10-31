import { useEffect, useRef, useState } from 'react';

import { useFlowStore } from '../../shared/state/flowStore.ts';
import { Button } from '../../shared/ui/Button.tsx';
import { Dialog } from '../../shared/ui/Dialog.tsx';
import { DropScrim } from './DropScrim.tsx';
import styles from './export.module.css';
import { openFilePicker, useExportUi } from './exportUi.ts';
import { loadFile, loadText } from './importActions.ts';
import { FILE_ACCEPT } from './importer.ts';
import { PdfDialog } from './PdfDialog.tsx';

const IMPORT_LABEL = 'Paste a mermaid.live link, a ```mermaid block or Mermaid code';

function PasteDialog() {
  const open = useFlowStore((s) => s.ui.importOpen);
  const setUi = useFlowStore((s) => s.setUi);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (open) areaRef.current?.focus();
  }, [open]);

  const setOpen = (next: boolean) => {
    setUi({ importOpen: next });
    if (!next) setText('');
  };
  const close = () => setOpen(false);
  const load = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      if (await loadText(text)) close();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title="Import"
      description={IMPORT_LABEL}
      showDescription
      actions={
        <>
          <Button
            onClick={() => {
              close();
              openFilePicker();
            }}
          >
            Open a file…
          </Button>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" onClick={() => void load()} disabled={!text.trim() || busy}>
            Load
          </Button>
        </>
      }
    >
      <textarea
        ref={areaRef}
        className={styles.textarea}
        aria-label={IMPORT_LABEL}
        placeholder="https://mermaid.live/edit#pako:..."
        spellCheck={false}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void load();
        }}
      />
    </Dialog>
  );
}

/** Shown when the clipboard refused the text, so it can still be selected and copied by hand. */
function CopyTextDialog() {
  const text = useExportUi((s) => s.copyFallback);
  const setText = useExportUi((s) => s.setCopyFallback);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (text !== null) {
      areaRef.current?.focus();
      areaRef.current?.select();
    }
  }, [text]);
  return (
    <Dialog
      open={text !== null}
      onOpenChange={(next) => {
        if (!next) setText(null);
      }}
      title="Copy this"
      actions={
        <Button variant="primary" onClick={() => setText(null)}>
          Done
        </Button>
      }
    >
      <textarea ref={areaRef} className={styles.textarea} readOnly value={text ?? ''} aria-label="Text to copy" />
    </Dialog>
  );
}

/** The file input behind "Open a file…", mounted once so the picker's answer always arrives. */
function FileInput() {
  const setFileInput = useExportUi((s) => s.setFileInput);
  return (
    <input
      type="file"
      accept={FILE_ACCEPT}
      hidden
      tabIndex={-1}
      aria-label="Open a diagram file"
      data-testid="import-file"
      ref={setFileInput}
      onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (file) void loadFile(file);
      }}
    />
  );
}

/**
 * Everything the export feature shows outside the menu: the paste dialog (`ui.importOpen`), the
 * PDF options, the clipboard fallback, the hidden file input and the drag-and-drop scrim.
 */
export function ImportDialog() {
  return (
    <>
      <PasteDialog />
      <PdfDialog />
      <CopyTextDialog />
      <FileInput />
      <DropScrim />
    </>
  );
}
