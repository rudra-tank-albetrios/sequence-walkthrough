import { liveLink, shareFragment } from '../../shared/lib/codec.ts';

/** Share links: the viewer link with the code inside and the mermaid.live link. */

export interface ShareText {
  /** What goes to the clipboard. */
  text: string;
  /** The toast after copying. */
  message: string;
}

/**
 * The viewer link for `pageUrl` (its fragment replaced). Inside a Claude artifact the page has no
 * usable address, so only the fragment is copied and the toast says where to put it.
 */
export async function viewerLink(
  code: string,
  step: number | null,
  pageUrl: string,
  artifact: boolean,
): Promise<ShareText> {
  const fragment = await shareFragment(code, step);
  const what =
    step !== null && step >= 0 ? `a viewer link that opens on step ${step + 1}` : 'a viewer link with the code inside';
  if (artifact) {
    return { text: fragment, message: `Copied the code fragment for ${what}. Add it to the end of this page's link.` };
  }
  const base = pageUrl.split('#')[0] ?? pageUrl;
  return { text: base + fragment, message: `Copied ${what}` };
}

export async function liveLinkText(code: string, theme: string, grid: boolean): Promise<ShareText> {
  return { text: await liveLink(code, theme, grid), message: 'Copied the mermaid.live link' };
}

/** Opens a link in a new tab without giving it a handle on this page. */
export function openInNewTab(url: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
