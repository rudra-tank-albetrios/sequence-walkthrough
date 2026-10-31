import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

import styles from './Overlay.module.css';

export interface OverlayProps {
  open: boolean;
  /** Asked to close: the close button, Esc or a click outside. */
  onClose: () => void;
  title: string;
  /** Called while closing, to put the focus back where the overlay was opened from. */
  onReturnFocus?: () => HTMLElement | null;
  children: ReactNode;
}

/**
 * The big panel the tools open in: 85% of the page, with the page still visible around it behind a
 * strong blur and a 75% dim. Radix keeps the focus inside it and closes it on Esc or an outside click.
 */
export function Overlay({ open, onClose, title, onReturnFocus, children }: OverlayProps) {
  return (
    <RadixDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={styles.scrim} data-testid="overlay-scrim" />
        <RadixDialog.Content
          className={styles.panel}
          data-testid="overlay"
          data-modal
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            const target = onReturnFocus?.();
            if (!target?.isConnected) return;
            event.preventDefault();
            target.focus();
          }}
        >
          <RadixDialog.Title className="sr-only">{title}</RadixDialog.Title>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/** The overlay's close button, wired to Radix so it closes through `onClose`. */
export const OverlayClose = RadixDialog.Close;
