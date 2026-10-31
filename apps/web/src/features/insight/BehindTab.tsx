import type { Flow, FlowUses, Step } from '@swv/core';

import { plural } from '../../shared/lib/util.ts';
import { Chip } from '../../shared/ui/Chip.tsx';
import { TermText } from '../../shared/ui/TermText.tsx';
import styles from './insight.module.css';
import { StepLink } from './StepLink.tsx';

/** The `@uses` side parts grouped by kind, and the `@effect` lines, with the steps they belong to. */
export function BehindTab({ flow, steps }: { flow: Flow; steps: Step[] }) {
  const visible = new Set(steps.map((s) => s.idx));
  const uses = flow.uses
    .map((u): FlowUses => ({ ...u, steps: u.steps.filter((i) => visible.has(i)) }))
    .filter((u) => u.steps.length > 0);
  const effects = flow.effects.filter((e) => visible.has(e.step));
  if (uses.length === 0 && effects.length === 0) {
    return (
      <p className={styles.empty}>
        No <span className="mono">@uses</span> or <span className="mono">@effect</span> lines yet. They
        list the hooks, crons, utilities, config and side effects that take part without being a layer.
      </p>
    );
  }
  const byKind = new Map<string, FlowUses[]>();
  for (const u of uses) byKind.set(u.kind, [...(byKind.get(u.kind) ?? []), u]);
  return (
    <>
      {[...byKind.entries()].map(([kind, items]) => (
        <details key={kind} open>
          <summary>
            <Chip tone="follow">{kind}</Chip> {plural(items.length, 'item')}
          </summary>
          <ul className={styles.il}>
            {items.map((u) => (
              <li key={`${u.kind}:${u.name}:${u.ref}`}>
                <b>{u.name}</b>
                {u.ref ? (
                  <>
                    {' '}
                    <span className={styles.ref}>{u.ref}</span>
                  </>
                ) : null}
                {u.text ? (
                  <p>
                    <TermText text={u.text} />
                  </p>
                ) : null}
                <div className={styles.ilMeta}>
                  {u.steps.map((i) => (
                    <StepLink key={i} index={i} />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </details>
      ))}
      {effects.length > 0 ? (
        <details open>
          <summary>
            <Chip tone="ok">effects</Chip> {plural(effects.length, 'item')}
          </summary>
          <ul className={styles.il}>
            {effects.map((e, i) => (
              <li key={`${e.step}-${i}`}>
                <TermText text={e.text} />{' '}
                <span className={styles.ilMeta}>
                  <StepLink index={e.step} />
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}
