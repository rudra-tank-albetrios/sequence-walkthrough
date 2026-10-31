import * as RadixMenu from '@radix-ui/react-dropdown-menu';
import type { ReactNode } from 'react';

import styles from './Menu.module.css';

export interface MenuProps {
  /** The button that opens the menu. It receives aria-haspopup and aria-expanded. */
  trigger: ReactNode;
  children: ReactNode;
  align?: 'start' | 'end';
  label?: string;
}

/** A drop-down menu with arrow-key navigation, typeahead and Esc to close. */
export function Menu({ trigger, children, align = 'end', label }: MenuProps) {
  return (
    <RadixMenu.Root modal={false}>
      <RadixMenu.Trigger asChild>{trigger}</RadixMenu.Trigger>
      <RadixMenu.Portal>
        <RadixMenu.Content className={styles.menu} align={align} sideOffset={6} aria-label={label}>
          {children}
        </RadixMenu.Content>
      </RadixMenu.Portal>
    </RadixMenu.Root>
  );
}

export interface MenuItemProps {
  onSelect: () => void;
  children: ReactNode;
  /** Grey text at the right, such as a file type or a shortcut. */
  hint?: string;
  disabled?: boolean;
}

export function MenuItem({ onSelect, children, hint, disabled }: MenuItemProps) {
  return (
    <RadixMenu.Item className={styles.item} onSelect={onSelect} disabled={disabled}>
      <span>{children}</span>
      {hint ? <span className={styles.hint}>{hint}</span> : null}
    </RadixMenu.Item>
  );
}

export function MenuHeading({ children }: { children: ReactNode }) {
  return <RadixMenu.Label className={styles.heading}>{children}</RadixMenu.Label>;
}

export function MenuSeparator() {
  return <RadixMenu.Separator className={styles.separator} />;
}

/** A row of several small items, such as the PNG scales. */
export function MenuRow({ children }: { children: ReactNode }) {
  return <div className={styles.row}>{children}</div>;
}
