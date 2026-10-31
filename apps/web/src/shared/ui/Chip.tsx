import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';

import styles from './Chip.module.css';

export type ChipTone =
  | 'neutral'
  | 'marker'
  | 'unconfirmed'
  | 'error'
  | 'ok'
  | 'follow'
  /** Coloured by a chapter hue passed as `hue`. */
  | 'chapter';

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'> {
  tone?: ChipTone;
  hue?: number;
  mono?: boolean;
  title?: string;
  /** Rendered as a button when `onClick` is given, otherwise as a span. */
  children: ReactNode;
}

/** A small labelled pill: status codes, flags, chapters, code references, bookmarks. */
export function Chip({ tone = 'neutral', hue, mono, title, children, onClick, className, ...rest }: ChipProps) {
  const classes = [styles.chip, styles[tone], mono ? 'mono' : '', className ?? ''].filter(Boolean).join(' ');
  const style = hue === undefined ? undefined : ({ '--ch': hue } as CSSProperties);
  if (onClick) {
    return (
      <button type="button" className={classes} style={style} title={title} onClick={onClick} {...rest}>
        {children}
      </button>
    );
  }
  return (
    <span className={classes} style={style} title={title}>
      {children}
    </span>
  );
}
