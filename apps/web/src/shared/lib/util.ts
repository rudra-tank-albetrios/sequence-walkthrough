/** Small helpers with no feature logic. */

export { hashStr } from '@swv/core';

/** The bundled Mermaid, named in the status line, the help and the loading message. */
export const MERMAID_VERSION = '12.2.0';

/** Joins the class names that are set; CSS module lookups may be undefined under strict indexing. */
export const cx = (...parts: (string | false | null | undefined)[]): string =>
  parts.filter(Boolean).join(' ');

/** True when a reference is a web address rather than a `path:line` in the code. */
export const isUrl = (ref: string): boolean => /^https?:\/\//i.test(ref);

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  cancel(): void;
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const debounced = ((...args: A) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
    }, ms);
  }) as Debounced<A>;
  debounced.cancel = () => {
    clearTimeout(timer);
  };
  return debounced;
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Exported files are named after the flow: reserved and control characters out, white space
 * collapsed, at most 120 characters, and the default name when nothing is left.
 */
export function fileName(title: string, extension: string): string {
  const safe = title
    .replace(/[\\/:*?"<>|\p{Cc}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
    .trim();
  return `${safe || 'Sequence diagram'}.${extension}`;
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 30_000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
