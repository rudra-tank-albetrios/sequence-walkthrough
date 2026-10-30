import { useEffect, useMemo, useRef } from 'react';

import { useFlowStore } from '../../shared/state/flowStore.ts';
import { findHits } from '../../shared/state/search.ts';
import { Button } from '../../shared/ui/Button.tsx';
import styles from './find.module.css';

/** Find in labels, explanations, payloads, names and chapters; Enter steps through the hits. */
export function FindPopover() {
  const open = useFlowStore((s) => s.ui.findOpen);
  const flow = useFlowStore((s) => s.flow);
  const cur = useFlowStore((s) => s.cur);
  const go = useFlowStore((s) => s.go);
  const setUi = useFlowStore((s) => s.setUi);
  const query = useFlowStore((s) => s.findQuery);
  const setQuery = useFlowStore((s) => s.setFindQuery);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const hits = useMemo(() => findHits(flow, query), [flow, query]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const at = hits.indexOf(cur);
  const count = !query.trim()
    ? ''
    : hits.length === 0
      ? 'No match'
      : `${at >= 0 ? at + 1 : '–'} of ${hits.length}`;

  const step = (direction: 1 | -1) => {
    if (hits.length === 0) return;
    const next = at < 0 ? (direction === 1 ? 0 : hits.length - 1) : (at + direction + hits.length) % hits.length;
    const index = hits[next];
    if (index !== undefined) go(index);
  };

  return (
    <div className={styles.pop} role="search" data-canvas-ui>
      <input
        ref={inputRef}
        type="search"
        placeholder="Find in labels and explanations"
        aria-label="Find"
        autoComplete="off"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          const first = findHits(flow, e.target.value)[0];
          if (first !== undefined) go(first);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            step(e.shiftKey ? -1 : 1);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setUi({ findOpen: false });
          }
        }}
      />
      <span className={styles.count} aria-live="polite">
        {count}
      </span>
      <Button icon aria-label="Previous match" onClick={() => step(-1)}>
        ↑
      </Button>
      <Button icon aria-label="Next match" onClick={() => step(1)}>
        ↓
      </Button>
      <Button icon variant="ghost" aria-label="Close find" onClick={() => setUi({ findOpen: false })}>
        ×
      </Button>
    </div>
  );
}

