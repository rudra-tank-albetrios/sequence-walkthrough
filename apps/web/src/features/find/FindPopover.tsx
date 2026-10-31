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

  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (wasOpen.current) {
      setQuery('');
      document.querySelector<HTMLElement>('[data-testid="diagram"]')?.focus({ preventScroll: true });
    }
    wasOpen.current = open;
  }, [open, setQuery]);

  if (!open) return null;

  const at = hits.indexOf(cur);
  const count = !query.trim()
    ? ''
    : hits.length === 0
      ? 'No match'
      : `${at >= 0 ? at + 1 : '–'} of ${hits.length}`;

  const step = (direction: 1 | -1) => {
    const index =
      direction === 1
        ? (hits.find((i) => i > cur) ?? hits[0])
        : ([...hits].reverse().find((i) => i < cur) ?? hits.at(-1));
    if (index !== undefined) go(index);
  };

  return (
    <div className={styles.pop} role="search" data-canvas-ui data-testid="find">
      <input
        ref={inputRef}
        type="search"
        placeholder="Find in labels and explanations"
        aria-label="Find"
        autoComplete="off"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          const found = findHits(flow, e.target.value);
          if (found.length > 0 && !found.includes(cur)) go(found.find((i) => i > cur) ?? found[0] ?? 0);
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
      <span className={styles.count} aria-live="polite" data-testid="find-count">
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

