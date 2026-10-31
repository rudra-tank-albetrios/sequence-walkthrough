import { useEffect } from 'react';

import { useExportUi } from './exportUi.ts';
import { loadFile, loadText } from './importActions.ts';
import { isLiveLink, looksLikeMermaid } from './importer.ts';

const hasFiles = (event: DragEvent): boolean => [...(event.dataTransfer?.types ?? [])].includes('Files');

/**
 * Window-wide import: files dragged anywhere show the scrim and the first one dropped is loaded; a
 * paste outside inputs that is a mermaid.live link or Mermaid code loads at once. Mount it once.
 */
export function useDropImport(): void {
  const setDragging = useExportUi((s) => s.setDragging);
  useEffect(() => {
    let depth = 0;
    const onEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth++;
      setDragging(true);
    };
    const onLeave = () => {
      if (--depth <= 0) {
        depth = 0;
        setDragging(false);
      }
    };
    const onOver = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      const file = event.dataTransfer?.files[0];
      if (file) void loadFile(file);
    };
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable]')) return;
      const text = event.clipboardData?.getData('text') ?? '';
      if (isLiveLink(text) || looksLikeMermaid(text)) {
        event.preventDefault();
        void loadText(text);
      }
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    document.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
      document.removeEventListener('paste', onPaste);
      setDragging(false);
    };
  }, [setDragging]);
}
