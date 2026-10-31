import { create } from 'zustand';

/**
 * State of the export feature's own surfaces, outside the menu: the menu's items unmount when it
 * closes, so the dialogs they open and the file input they click live in the always-mounted
 * `ImportDialog` tree and are driven through this store.
 */
export interface ExportUiState {
  pdfOpen: boolean;
  /** Files are being dragged over the window. */
  dragging: boolean;
  /** Set by the mounted file input, called by "Open a file…". */
  fileInput: HTMLInputElement | null;
  setPdfOpen: (open: boolean) => void;
  setDragging: (dragging: boolean) => void;
  setFileInput: (input: HTMLInputElement | null) => void;
}

export const useExportUi = create<ExportUiState>((set) => ({
  pdfOpen: false,
  dragging: false,
  fileInput: null,
  setPdfOpen(pdfOpen) {
    set({ pdfOpen });
  },
  setDragging(dragging) {
    set({ dragging });
  },
  setFileInput(fileInput) {
    set({ fileInput });
  },
}));

export function openFilePicker(): void {
  useExportUi.getState().fileInput?.click();
}
