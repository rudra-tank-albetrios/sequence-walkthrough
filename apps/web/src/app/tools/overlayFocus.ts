/**
 * The overlay gives the focus back to the button that opened it. A menu closes before the overlay
 * opens, so a menu names its button here; anything else is whatever had the focus at that moment.
 */
let opener: HTMLElement | null = null;

export function rememberOpener(element: HTMLElement | null): void {
  opener = element;
}

/** The overlay is opening: what had the focus is the opener, unless a menu already named one. */
export function rememberFocus(): void {
  if (!opener && document.activeElement instanceof HTMLElement) opener = document.activeElement;
}

/** The overlay is closing: where the focus goes back to. The canvas when the opener is gone. */
export function takeOpener(): HTMLElement | null {
  const element = opener;
  opener = null;
  if (element?.isConnected && element !== document.body) return element;
  return document.querySelector<HTMLElement>('[data-testid="diagram"]');
}
