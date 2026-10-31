import { Fragment } from 'react';

import { cx } from '../../shared/lib/util.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { askAboutWord } from '../../shared/state/follow.ts';
import { Button } from '../../shared/ui/Button.tsx';
import styles from './walkbar.module.css';

/** The followed value and the steps that mention it; ‹ › move between them and wrap around. */
export function FollowStrip() {
  const follow = useFlowStore((s) => s.follow);
  const cur = useFlowStore((s) => s.cur);
  const go = useFlowStore((s) => s.go);
  const setFollow = useFlowStore((s) => s.setFollow);
  if (!follow) return null;
  const { token, hits } = follow;
  const step = (direction: 1 | -1) => {
    const target =
      direction === 1 ? (hits.find((i) => i > cur) ?? hits[0]) : ([...hits].reverse().find((i) => i < cur) ?? hits.at(-1));
    if (target !== undefined) go(target);
  };
  return (
    <div className={styles.follow} role="group" aria-label="Followed value" data-testid="follow-strip">
      <span>
        <code>{token}</code> appears in step{hits.length === 1 ? '' : 's'}
      </span>
      <span className={styles.followSteps}>
        {hits.map((i, k) => (
          <Fragment key={i}>
            {k > 0 ? ', ' : ''}
            <button
              type="button"
              className={cx(styles.followStep, i === cur && styles.cur)}
              aria-label={`Go to step ${i + 1}`}
              onClick={() => go(i)}
            >
              {i + 1}
            </button>
          </Fragment>
        ))}
      </span>
      <Button variant="ghost" className={styles.small} aria-label="Previous step with this value" onClick={() => step(-1)}>
        ‹
      </Button>
      <Button variant="ghost" className={styles.small} aria-label="Next step with this value" onClick={() => step(1)}>
        ›
      </Button>
      <Button
        variant="ghost"
        className={styles.small}
        title="Ask what this value is"
        onClick={() => {
          askAboutWord(token);
        }}
      >
        Ask
      </Button>
      <Button variant="ghost" className={styles.small} aria-label="Stop following" onClick={() => setFollow(null)}>
        ×
      </Button>
    </div>
  );
}
