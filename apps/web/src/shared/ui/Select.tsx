import type { SelectHTMLAttributes } from 'react';

import styles from './Select.module.css';

/** A native select in the toolbar style; options are passed as children. */
export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={[styles.select, className ?? ''].filter(Boolean).join(' ')} {...rest} />;
}
