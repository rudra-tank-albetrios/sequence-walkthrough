import * as RadixMenu from '@radix-ui/react-dropdown-menu';
import type { ReactNode } from 'react';

import styles from './Menu.module.css';

export interface MenuProps {
  /** The button that opens the menu. It receives aria-haspopup and aria-expanded. */
  trigger: ReactNode;
  children: ReactNode;
  align?: 'start' | 'end';
  label?: string;
  /** Runs as the menu closes; call `preventDefault` when something else took the focus. */
  onCloseAutoFocus?: (event: Event) => void;
}

/** A drop-down menu with arrow-key navigation, typeahead and Esc to close. */
export function Menu({ trigger, children, align = 'end', label, onCloseAutoFocus }: MenuProps) {
  return (
    <RadixMenu.Root modal={false}>
      <RadixMenu.Trigger asChild>{trigger}</RadixMenu.Trigger>
      <RadixMenu.Portal>
        <RadixMenu.Content
          className={styles.menu}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          aria-label={label}
          {...(onCloseAutoFocus ? { onCloseAutoFocus } : {})}
        >
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
  /** A small icon before the text. */
  icon?: ReactNode;
  /** The name the guided tour finds this item by. */
  tour?: string;
}

export function MenuItem({ onSelect, children, hint, disabled, icon, tour }: MenuItemProps) {
  return (
    <RadixMenu.Item
      className={styles.item}
      onSelect={onSelect}
      disabled={disabled}
      {...(tour ? { 'data-tour': tour } : {})}
    >
      {icon ? (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className={styles.text}>{children}</span>
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
