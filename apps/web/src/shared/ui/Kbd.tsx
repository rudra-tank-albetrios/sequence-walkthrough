import type { ReactNode } from 'react';

import styles from './Kbd.module.css';

/** A keyboard key, as shown in titles, menus and the shortcuts dialog. */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className={styles.kbd}>{children}</kbd>;
}
