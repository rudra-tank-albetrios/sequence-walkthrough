import { findArrow } from '@swv/core';
import type { ReactNode } from 'react';

import styles from './codePanel.module.css';

const TAG_RE = /^(\s*)(%%\s*@[A-Za-z]+(?:\.[A-Za-z]+)?)(.*)$/;
const COMMENT_RE = /^\s*%%/;
const KEYWORD_RE =
  /^(\s*)(sequenceDiagram|participant|actor|note\s+(?:over|left of|right of)|note|loop|alt|else|opt|par_over|par|and|critical|option|break|rect|end|activate|deactivate|autonumber|box|create\s+participant|create\s+actor|create|destroy|title|links?|properties|details|accTitle|accDescr)\b(.*)$/i;
const ALIAS_RE = /^(\s+)(\S+)(\s+as\s+)(.*)$/i;

/**
 * One line of Mermaid as coloured spans: `%% @tag` lines (tag and text), other comments, statement
 * keywords with the alias of `participant X as Name`, and arrows (left alias, arrow, right alias).
 * Text is rendered as React children, never as HTML.
 */
export function highlightLine(line: string): ReactNode {
  const tag = TAG_RE.exec(line);
  if (tag) {
    return (
      <>
        {tag[1]}
        <span className={styles['t-tag']}>{tag[2]}</span>
        <span className={styles['t-tagtx']}>{tag[3]}</span>
      </>
    );
  }
  if (COMMENT_RE.test(line)) return <span className={styles['t-cm']}>{line}</span>;
  const keyword = KEYWORD_RE.exec(line);
  if (keyword) {
    const rest = keyword[3] ?? '';
    const alias = ALIAS_RE.exec(rest);
    return (
      <>
        {keyword[1]}
        <span className={styles['t-kw']}>{keyword[2]}</span>
        {alias ? (
          <>
            {alias[1]}
            <span className={styles['t-al']}>{alias[2]}</span>
            {alias[3]}
            {alias[4]}
          </>
        ) : (
          rest
        )}
      </>
    );
  }
  const colon = line.indexOf(':');
  const left = colon >= 0 ? line.slice(0, colon) : line;
  const arrow = findArrow(left);
  if (arrow?.index !== undefined) {
    const start = arrow.index;
    const end = start + arrow[0].length;
    return (
      <>
        <span className={styles['t-al']}>{left.slice(0, start)}</span>
        <span className={styles['t-ar']}>{left.slice(start, end)}</span>
        <span className={styles['t-al']}>{left.slice(end)}</span>
        {colon >= 0 ? line.slice(colon) : null}
      </>
    );
  }
  return line;
}

/** Joins class names, dropping the falsy ones (CSS module lookups may be undefined). */
export const cx = (...parts: (string | false | null | undefined)[]): string =>
  parts.filter(Boolean).join(' ');
