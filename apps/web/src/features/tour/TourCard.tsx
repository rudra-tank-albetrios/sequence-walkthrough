import * as RadixDialog from '@radix-ui/react-dialog';
import { useLayoutEffect, useRef, type KeyboardEvent } from 'react';

import { Button } from '../../shared/ui/Button.tsx';
import { Chip } from '../../shared/ui/Chip.tsx';
import { placeCard, type Box } from './placement.ts';
import type { DemoUsage, TourStop } from './stops.ts';
import styles from './tour.module.css';

/** The colours of the real usage bar (plan section 8.2): green, then amber at 60%, red above 85%. */
function usageTone(usedPercent: number): string | undefined {
  if (usedPercent > 85) return styles.high;
  return usedPercent >= 60 ? styles.mid : styles.low;
}

function DemoUsagePanel({ usage }: { usage: DemoUsage }) {
  return (
    <section className={styles.demo} aria-label="Demo usage" data-testid="tour-demo-usage">
      <p className={styles.demoHead}>
        <Chip tone="marker">Demo</Chip> Simulated numbers, not your usage.
      </p>
      <ul className={styles.bars}>
        {usage.bars.map((bar) => (
          <li key={bar.model}>
            <span className={styles.barText}>
              <b>{bar.model}</b> {bar.usedPercent}% used, {bar.left}
            </span>
            <span
              className={styles.meter}
              role="meter"
              aria-label={`${bar.model} usage, demo`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={bar.usedPercent}
            >
              <span
                className={`${styles.fill} ${usageTone(bar.usedPercent) ?? ''}`}
                style={{ width: `${bar.usedPercent}%` }}
              />
            </span>
          </li>
        ))}
      </ul>
      <p className={styles.notice}>{usage.notice}</p>
    </section>
  );
}

export interface TourCardProps {
  stop: TourStop;
  index: number;
  total: number;
  box: Box | null;
  onBack: () => void;
  onNext: () => void;
  onEnd: () => void;
}

/**
 * The card of one stop, as a modal dialog. Mount it after the stop's feature has opened: the layer
 * opened last is the one on top, so the card keeps the focus even over a feature's own dialog.
 */
export function TourCard({ stop, index, total, box, onBack, onNext, onEnd }: TourCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const nextRef = useRef<HTMLButtonElement | null>(null);
  const last = index === total - 1;

  useLayoutEffect(() => {
    const place = () => {
      const card = cardRef.current;
      if (!card) return;
      const size = { width: card.offsetWidth, height: card.offsetHeight };
      const { left, top } = placeCard(box, size, {
        width: window.innerWidth,
        height: window.innerHeight,
      });
      card.style.left = `${left}px`;
      card.style.top = `${top}px`;
    };
    place();
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('resize', place);
    };
  }, [box]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowRight' && !last) onNext();
    else if (event.key === 'ArrowLeft' && index > 0) onBack();
  };

  return (
    <RadixDialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onEnd();
      }}
    >
      <RadixDialog.Portal>
        <RadixDialog.Content
          ref={cardRef}
          className={styles.card}
          data-testid="tour-card"
          data-stop={stop.id}
          onKeyDown={onKeyDown}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            nextRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
          }}
          onInteractOutside={(event) => {
            event.preventDefault();
          }}
        >
          <RadixDialog.Title className={styles.title}>
            <span className={styles.count}>
              Stop {index + 1} of {total}
            </span>
            {stop.title}
          </RadixDialog.Title>
          <RadixDialog.Description className={styles.body}>{stop.body}</RadixDialog.Description>
          {stop.demoUsage ? <DemoUsagePanel usage={stop.demoUsage} /> : null}
          <div className={styles.actions}>
            <Button variant="ghost" onClick={onEnd}>
              Skip tour
            </Button>
            <span className={styles.move}>
              <Button disabled={index === 0} onClick={onBack}>
                Back
              </Button>
              <Button ref={nextRef} variant="primary" onClick={last ? onEnd : onNext}>
                {last ? 'Finish' : 'Next'}
              </Button>
            </span>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
