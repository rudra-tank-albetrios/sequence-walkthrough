import { create } from 'zustand';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastState {
  message: string;
  action: ToastAction | null;
  /** Changes with every toast so the same text shown twice still re-announces. */
  seq: number;
}

export const useToastStore = create<ToastState>(() => ({ message: '', action: null, seq: 0 }));

let timer: ReturnType<typeof setTimeout> | undefined;

export function dismissToast(): void {
  clearTimeout(timer);
  useToastStore.setState({ message: '', action: null });
}

/** A short message at the bottom of the page, replaced by the next: 3.2 s, or 8 s with a button. */
export function toast(message: string, action?: ToastAction): void {
  clearTimeout(timer);
  useToastStore.setState((s) => ({ message, action: action ?? null, seq: s.seq + 1 }));
  timer = setTimeout(dismissToast, action ? 8000 : 3200);
}
