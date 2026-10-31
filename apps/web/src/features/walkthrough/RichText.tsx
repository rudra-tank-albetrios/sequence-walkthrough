import { isFollowable, tokens } from '@swv/core';
import { Fragment, type ReactNode } from 'react';

import { cx } from '../../shared/lib/util.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { startFollow } from '../../shared/state/follow.ts';
import { useGlossary } from '../../shared/state/useGlossary.ts';
import { TermPopover } from '../../shared/ui/TermText.tsx';
import styles from './card.module.css';

/**
 * A label or payload line: a click on a followable word follows the value through the flow (title
 * "Follow this value"), a click on a glossary word opens its definition.
 */
export function TokenText({ text }: { text: string }) {
  const glossary = useGlossary();
  const followed = useFlowStore((s) => s.follow?.token.toLowerCase() ?? null);
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  const words = tokens(text);
  for (const word of words) {
    const at = text.indexOf(word, last);
    if (at < 0) continue;
    out.push(text.slice(last, at));
    const entry = glossary.lookup(word);
    const on = followed !== null && word.toLowerCase() === followed;
    if (entry) {
      out.push(<TermPopover key={i} entry={entry} text={word} className={cx(styles.tok, on && styles.on)} />);
    } else if (isFollowable(word)) {
      out.push(
        <span
          key={i}
          className={cx(styles.tok, on && styles.on)}
          title="Follow this value"
          data-tok={word}
          onClick={() => {
            startFollow(word);
          }}
        >
          {word}
        </span>,
      );
    } else {
      out.push(word);
    }
    last = at + word.length;
    i++;
  }
  out.push(text.slice(last));
  return <>{out}</>;
}

const STEP_RE = /\bstep\s+(\d+)\b/gi;

/** Text in which "step 6" becomes a link to that step. */
export function StepLinks({ text }: { text: string }) {
  const flow = useFlowStore((s) => s.flow);
  const go = useFlowStore((s) => s.go);
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(STEP_RE)) {
    const n = Number(m[1]);
    const step = flow?.steps[n - 1];
    if (!step) continue;
    out.push(text.slice(last, m.index));
    out.push(
      <button type="button" key={m.index} className={styles.stepLink} onClick={() => go(step.idx)}>
        {m[0]}
      </button>,
    );
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return (
    <>
      {out.map((part, k) => (
        <Fragment key={k}>{part}</Fragment>
      ))}
    </>
  );
}
