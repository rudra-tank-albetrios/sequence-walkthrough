import type { Flow } from '@swv/core';
import { useEffect, useRef, type CSSProperties } from 'react';

import { cx, plural } from '../../shared/lib/util.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import styles from './dock.module.css';

/** One label per chapter, each as wide as its stretch of the Flow Rail below. Hidden when there are none. */
export function ChaptersNav({ flow }: { flow: Flow }) {
  const cur = useFlowStore((s) => s.cur);
  const go = useFlowStore((s) => s.go);
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
        <button
          key={sec.idx}
          type="button"
          className={cx(styles.chapter, i === current && styles.cur)}
          style={{ '--ch': sec.hue, flexGrow: sec.count } as CSSProperties}
          {...(i === current ? { 'aria-current': 'step' as const } : {})}
          title={sec.summary || `${plural(sec.count, 'step')}, from step ${String(sec.firstStep + 1)}`}
          onClick={() => {
            go(sec.firstStep);
          }}
        >
          <span>{sec.name}</span>
        </button>
      ))}
    </nav>
  );
}
