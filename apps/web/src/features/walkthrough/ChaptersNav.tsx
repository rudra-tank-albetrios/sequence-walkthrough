import type { Flow } from '@swv/core';
import { Fragment, useEffect, useRef, type CSSProperties } from 'react';

import { cx, plural } from '../../shared/lib/util.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import styles from './walkbar.module.css';

/** One tab per chapter in its hue; the current one is underlined. Hidden when there are none. */
export function ChaptersNav({ flow }: { flow: Flow }) {
  const cur = useFlowStore((s) => s.cur);
  const go = useFlowStore((s) => s.go);
  const chapterLock = useFlowStore((s) => s.chapterLock);
  const toggleChapterLock = useFlowStore((s) => s.toggleChapterLock);
  const navRef = useRef<HTMLElement | null>(null);
  const current = flow.steps[cur]?.section ?? -1;

  useEffect(() => {
    const el = navRef.current?.querySelector('[aria-current="step"]');
    if (el && 'scrollIntoView' in el) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [current]);

  if (flow.sections.length === 0) return null;
  return (
    <nav ref={navRef} className={styles.chapters} aria-label="Chapters" data-chapters data-testid="chapters">
      {flow.sections.map((sec, i) => (
        <Fragment key={sec.idx}>
          {i > 0 ? (
            <span className={styles.sep} aria-hidden="true">
              ·
            </span>
          ) : null}
          <button
            type="button"
            className={cx(styles.chapter, i === current && styles.cur)}
            style={{ '--ch': sec.hue } as CSSProperties}
            {...(i === current ? { 'aria-current': 'step' as const } : {})}
            title={sec.summary || `${plural(sec.count, 'step')}, from step ${sec.firstStep + 1}`}
            onClick={() => go(sec.firstStep)}
          >
            <span className={styles.dot} aria-hidden="true" />
            {sec.name}
          </button>
        </Fragment>
      ))}
      <button
        type="button"
        className={styles.lock}
        aria-pressed={chapterLock}
        aria-label="Stay inside the current chapter"
        title="Stay inside the current chapter (K)"
        onClick={toggleChapterLock}
      >
        <span aria-hidden="true">{chapterLock ? '🔒' : '🔓'}</span>
      </button>
    </nav>
  );
}
