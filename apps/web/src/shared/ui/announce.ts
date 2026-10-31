import { create } from 'zustand';

/** What the page's one screen reader line says; `LiveRegion` renders it. */
export const useLiveStore = create<{ text: string }>(() => ({ text: '' }));

let timer: ReturnType<typeof setTimeout> | undefined;

/** Tells screen readers something. The line is cleared first so a repeated sentence is read again. */
export function announce(text: string): void {
  clearTimeout(timer);
  useLiveStore.setState({ text: '' });
  timer = setTimeout(() => {
    useLiveStore.setState({ text });
  }, 30);
}
