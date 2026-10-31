import type { Flow, Step } from '@swv/core';

import { cx, isUrl, plural } from '../../shared/lib/util.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { Button } from '../../shared/ui/Button.tsx';
import { Chip } from '../../shared/ui/Chip.tsx';
import { stripLine, unique, ZONE_LABEL } from './derive.ts';
import styles from './insight.module.css';
import { StepLink } from './StepLink.tsx';

/** One card per participant: what the layer is, what it does, where it appears, what it uses. */
export function LayersTab({ flow, steps }: { flow: Flow; steps: Step[] }) {
  const spot = useFlowStore((s) => s.spot);
  const setSpot = useFlowStore((s) => s.setSpot);
  return (
    <>
      <ul className={styles.il}>
        {flow.participants.map((p) => {
          const layer = flow.layers[p.alias];
          const mine = steps.filter((s) => s.from === p.alias || s.to === p.alias);
          const sent = mine.filter((s) => s.from === p.alias);
          const chapters = unique(
            mine.map((s) => flow.sections[s.section]?.name).filter((name): name is string => Boolean(name)),
          );
          const files = unique(sent.flatMap((s) => s.refs).filter((r) => !isUrl(r)).map(stripLine));
          const uses = unique(sent.flatMap((s) => s.uses.map((u) => `${u.kind} ${u.name}`)));
          const on = spot === p.alias;
          const zone = layer?.zone ? ZONE_LABEL[layer.zone] : undefined;
          return (
            <li key={p.alias} className={cx(on && styles.on)} data-layer={p.alias}>
              <div className={styles.ilH}>
                {layer?.icon ? (
                  <span className={styles.icon} aria-hidden="true">
                    {layer.icon}
                  </span>
                ) : null}
                <b>{p.name}</b>
                {layer?.kind ? <Chip tone="follow">{layer.kind}</Chip> : null}
                <span className={styles.muted}>{p.alias}</span>
                {zone ? <span className={styles.muted}>· {zone}</span> : null}
                <Button className={styles.ilBtn} onClick={() => setSpot(on ? null : p.alias)}>
                  {on ? 'Show all' : 'Only this layer'}
                </Button>
              </div>
              <p>{layer?.desc?.trim() ? layer.desc : <span className={styles.muted}>No @layer description.</span>}</p>
              <div className={styles.ilMeta}>
                {plural(mine.length, 'step')}
                {chapters.length > 0 ? ` · ${chapters.join(', ')}` : ''}
              </div>
              {mine.length > 0 ? (
                <div className={styles.ilMeta}>
                  {mine.map((s) => (
                    <StepLink key={s.idx} index={s.idx} chip />
                  ))}
                </div>
              ) : null}
              {files.length > 0 ? (
                <div className={styles.ilMeta}>
                  Files:
                  {files.map((file) => (
                    <span key={file} className={styles.ref}>
                      {file}
                    </span>
                  ))}
                </div>
              ) : null}
              {uses.length > 0 ? (
                <div className={styles.ilMeta}>
                  Uses:
                  {uses.map((use) => (
                    <Chip key={use} tone="follow">
                      {use}
                    </Chip>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {flow.boundaries.length > 0 ? (
        <p className={styles.muted}>
          Trust boundaries:{' '}
          {flow.boundaries
            .map((b) => `${flow.layers[b.left]?.name ?? b.left} │ ${flow.layers[b.right]?.name ?? b.right}`)
            .join('; ')}
          .
        </p>
      ) : (
        <p className={styles.muted}>
          Add <span className="mono">kind=</span> to the @layer lines to get icons and trust-boundary
          lines.
        </p>
      )}
    </>
  );
}
