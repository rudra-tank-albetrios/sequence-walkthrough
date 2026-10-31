import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

import { Button } from './Button.tsx';
import styles from './Dialog.module.css';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Read by screen readers; shown under the title when `showDescription` is set. */
  description?: string;
  showDescription?: boolean;
  /** `wide` for tables and settings, `narrow` for short questions. */
  size?: 'narrow' | 'default' | 'wide';
  children: ReactNode;
  /** Buttons at the bottom right. */
  actions?: ReactNode;
}

/** A modal dialog with a scrim, focus kept inside, Esc and outside click to close. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  showDescription = false,
  size = 'default',
  children,
  actions,
}: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={styles.overlay} />
        <RadixDialog.Content className={`${styles.content} ${styles[size]}`} data-modal>
          <div className={styles.head}>
            <RadixDialog.Title className={styles.title}>{title}</RadixDialog.Title>
            <RadixDialog.Close asChild>
              <Button variant="ghost" icon aria-label="Close">
                ×
              </Button>
            </RadixDialog.Close>
          </div>
          {description ? (
            <RadixDialog.Description className={showDescription ? styles.description : 'sr-only'}>
              {description}
            </RadixDialog.Description>
          ) : null}
          <div className={styles.body}>{children}</div>
          {actions ? <div className={styles.actions}>{actions}</div> : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
