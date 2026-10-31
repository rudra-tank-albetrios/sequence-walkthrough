import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import styles from './Button.module.css';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** `ghost` has no border, `primary` is ink on paper, `icon` is a 32px square. */
  variant?: 'default' | 'ghost' | 'primary';
  icon?: boolean;
  /** Toggle buttons read as pressed through aria-pressed and get the marker colour. */
  pressed?: boolean;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'default', icon = false, pressed, className, type = 'button', children, ...rest },
  ref,
) {
  const classes = [
    styles.btn,
    variant === 'ghost' ? styles.ghost : '',
    variant === 'primary' ? styles.primary : '',
    icon ? styles.icon : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      {...(pressed === undefined ? {} : { 'aria-pressed': pressed })}
      {...rest}
    >
      {children}
    </button>
  );
});
