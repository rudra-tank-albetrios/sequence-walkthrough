import { useRef, useState, type RefObject } from 'react';

import { clamp } from '../../shared/lib/util.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { toast } from '../../shared/ui/toast.ts';
import { MIN_CARD_H, maxCardH, resetCardHeight } from './cardHeight.ts';
import styles from './walkbar.module.css';

/** The top edge of the step bar: drag or ↑/↓ change the card height, double-click resets it. */
export function ResizeHandle({ barRef }: { barRef: RefObject<HTMLElement | null> }) {
  const cardH = useFlowStore((s) => s.settings.cardH);
  const updateSettings = useFlowStore((s) => s.updateSettings);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startY: number; startH: number; last: number } | null>(null);

  const currentHeight = (): number => {
    if (cardH !== undefined) return cardH;
    const centre = barRef.current?.querySelector<HTMLElement>('[data-testid="card-cur"]');
    return centre?.offsetHeight ?? 200;
  };
  const apply = (h: number) => {
    barRef.current?.style.setProperty('--card-h', `${h}px`);
    barRef.current?.setAttribute('data-sized', '');
  };

  return (
    <div
      className={styles.resize}
      role="separator"
      aria-orientation="horizontal"
      aria-label="Drag to change the height of the step bar"
      aria-valuemin={MIN_CARD_H}
      aria-valuemax={maxCardH()}
      aria-valuenow={cardH ?? MIN_CARD_H}
      title="Drag to change the height. Double-click to reset."
      tabIndex={0}
      data-testid="wb-resize"
      {...(dragging ? { 'data-dragging': '' } : {})}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const startH = currentHeight();
        drag.current = { startY: e.clientY, startH, last: startH };
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        d.last = clamp(d.startH + (d.startY - e.clientY), MIN_CARD_H, maxCardH());
        apply(d.last);
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        if (!d) return;
        drag.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
        setDragging(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        updateSettings({ cardH: d.last });
      }}
      onDoubleClick={() => {
        resetCardHeight();
        toast('Step bar height reset');
      }}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        const next = clamp(currentHeight() + (e.key === 'ArrowUp' ? 20 : -20), MIN_CARD_H, maxCardH());
        updateSettings({ cardH: next });
      }}
    />
  );
}
