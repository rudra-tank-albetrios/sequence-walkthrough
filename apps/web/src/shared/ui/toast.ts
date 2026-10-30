import { create } from 'zustand';

interface ToastState {
  message: string;
  /** Changes with every toast so the same text shown twice still re-announces. */
  seq: number;
}

export const useToastStore = create<ToastState>(() => ({ message: '', seq: 0 }));

let timer: ReturnType<typeof setTimeout> | undefined;

/** Shows a short confirmation at the bottom of the page for two seconds. */
export function toast(message: string): void {
  clearTimeout(timer);
  useToastStore.setState((s) => ({ message, seq: s.seq + 1 }));
  timer = setTimeout(() => {
    useToastStore.setState({ message: '' });
  }, 2200);
}
