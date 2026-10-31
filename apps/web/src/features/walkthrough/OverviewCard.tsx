import type { Flow } from '@swv/core';

import { plural } from '../../shared/lib/util.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { Chip } from '../../shared/ui/Chip.tsx';
import { Kbd } from '../../shared/ui/Kbd.tsx';
import styles from './card.module.css';
import { cx } from './cx.ts';
import { TermText } from './RichText.tsx';
import { statusFamily } from './steps.ts';

/** The card shown before step 1: what the flow is, where it ends, and its layers. */
export function OverviewCard({ flow }: { flow: Flow }) {
  const go = useFlowStore((s) => s.go);
  const spot = useFlowStore((s) => s.spot);
  const setSpot = useFlowStore((s) => s.setSpot);
  const setUi = useFlowStore((s) => s.setUi);
  const n = flow.steps.length;
  const chapters = flow.sections.length > 0 ? ` in ${plural(flow.sections.length, 'chapter')}` : '';
  const openInsight = () => {
    setUi({ insightOpen: true });
  };
  return (
    <div className={styles.overview} data-testid="overview">
      <h3>
        {flow.title}
        {flow.proposed ? <Chip tone="unconfirmed">proposed</Chip> : null}
      </h3>
      <p>
        {n} steps, {plural(flow.participants.length, 'layer')}
        {chapters}. Press <Kbd>→</Kbd> to start, or click any arrow.
      </p>
      {flow.proposed ? (
        <p className={cx(styles.ovLine, styles.warn)}>
          <b>Proposed design.</b> This flow does not exist in the code yet; it follows the project&apos;s own
          patterns.
        </p>
      ) : null}
      {flow.scope ? (
        <p className={styles.ovLine}>
          <b>Scope:</b> <TermText text={flow.scope} />
        </p>
      ) : null}
      {flow.trigger ? (
        <p className={styles.ovLine}>
          <b>Starts when:</b> <TermText text={flow.trigger} />
        </p>
      ) : null}
      {flow.summary ? (
        <p className={styles.ovLine}>
          <TermText text={flow.summary} />
        </p>
      ) : null}
      {flow.endings.length > 0 ? (
        <p className={cx(styles.ovLine, styles.replies)} data-testid="endings">
          <b>Possible endings:</b>
          {flow.endings.map((i) => {
            const step = flow.steps[i];
            if (!step) return null;
            return (
              <Chip
                key={i}
                className={cx(styles.st, styles[statusFamily(step)])}
                title={`Go to step ${step.n}`}
                onClick={() => go(i)}
              >
                {step.label[0]}
              </Chip>
            );
          })}
        </p>
      ) : null}
      <div className={styles.layers}>
        {flow.participants.map((p) => {
          const layer = flow.layers[p.alias];
          const desc = layer?.desc ?? '';
          return (
            <button
              key={p.alias}
              type="button"
              className={styles.layerPill}
              title={desc === '' ? 'Click to show only its arrows' : desc}
              aria-pressed={spot === p.alias}
              onClick={() => {
                setSpot(spot === p.alias ? null : p.alias);
              }}
            >
              {layer?.icon ? <span aria-hidden="true">{layer.icon}</span> : null}
              <b>{p.name}</b>
            </button>
          );
        })}
      </div>
      <div className={styles.ovExtras}>
          <Chip
            data-open="review"
            onClick={() => {
              setUi({ reviewOpen: true });
            }}
          >
            Review this flow
          </Chip>
          {flow.threats.length > 0 ? (
            <Chip
              tone="error"
              data-open="threats"
              onClick={() => {
                setUi({ threatsOpen: true });
              }}
            >
              {plural(flow.threats.length, 'possible threat')}
            </Chip>
          ) : null}
          {flow.uses.length > 0 ? (
            <Chip data-open="behind" onClick={openInsight}>
              {plural(flow.uses.length, 'side part')}
            </Chip>
          ) : null}
          {flow.terms.length > 0 ? (
            <Chip data-open="glossary" onClick={openInsight}>
              {plural(flow.terms.length, 'term')}
            </Chip>
          ) : null}
          {flow.unconfirmed > 0 ? (
            <Chip tone="unconfirmed" data-open="errors" onClick={openInsight}>
              {plural(flow.unconfirmed, 'unconfirmed detail')}
            </Chip>
          ) : null}
      </div>
    </div>
  );
}
