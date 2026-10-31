import * as Popover from '@radix-ui/react-popover';
import type { Flow, FlowUses } from '@swv/core';
import { useState } from 'react';

import { plural } from '../../shared/lib/util.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { Button } from '../../shared/ui/Button.tsx';
import { Chip } from '../../shared/ui/Chip.tsx';
import { usesSummary } from './steps.ts';
import styles from './walkbar.module.css';

function byKind(uses: FlowUses[]): [string, FlowUses[]][] {
  const map = new Map<string, FlowUses[]>();
  for (const u of uses) map.set(u.kind, [...(map.get(u.kind) ?? []), u]);
  return [...map.entries()];
}

/** "⚙ Behind N": hooks, crons, utilities, config and effects that take part without being a layer. */
export function BehindPopover({ flow }: { flow: Flow }) {
  const [open, setOpen] = useState(false);
  const cur = useFlowStore((s) => s.cur);
  const go = useFlowStore((s) => s.go);
  const setUi = useFlowStore((s) => s.setUi);
  const count = flow.uses.length + flow.effects.length;
  if (count === 0) return null;
  const step = flow.steps[cur];
  const jump = (i: number) => {
    go(i);
    setOpen(false);
  };
  const stepChips = (indexes: number[]) =>
    indexes.map((i) => (
      <Chip key={i} tone={i === cur ? 'marker' : 'neutral'} title={`Go to step ${i + 1}`} onClick={() => jump(i)}>
        {i + 1}
      </Chip>
    ));
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button
          variant="ghost"
          className={styles.behind}
          title="Hooks, crons, utilities, config and side effects that take part without being a layer"
          data-testid="behind-btn"
        >
          <span aria-hidden="true">⚙</span> Behind <span className={styles.n}>{count}</span>
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className={styles.pop} align="end" sideOffset={6} collisionPadding={8} aria-label="Behind the scenes">
          <h3>Behind the scenes</h3>
          <p className={styles.popIntro}>
            Parts that take part without being a layer.
            {step ? ` Step ${step.n} uses ${step.uses.length > 0 ? usesSummary(step.uses) : 'none of them'}.` : ''}
          </p>
          {byKind(flow.uses).map(([kind, items]) => (
            <details key={kind} open={step?.uses.some((u) => u.kind === kind) ?? false}>
              <summary>
                <Chip tone="follow">{kind}</Chip> {plural(items.length, 'item')}
              </summary>
              <ul>
                {items.map((u) => (
                  <li key={u.name} className={styles.bh}>
                    <div>
                      <b>{u.name}</b>
                      {u.ref ? (
                        <>
                          {' '}
                          <Chip mono>{u.ref}</Chip>
                        </>
                      ) : null}
                      {u.text ? <div className={styles.bhText}>{u.text}</div> : null}
                    </div>
                    <div className={styles.bhSteps}>{stepChips(u.steps)}</div>
                  </li>
                ))}
              </ul>
            </details>
          ))}
          {flow.effects.length > 0 ? (
            <details open={(step?.effects.length ?? 0) > 0}>
              <summary>
                <Chip tone="ok">effects</Chip> {plural(flow.effects.length, 'item')}
              </summary>
              <ul>
                {flow.effects.map((e, i) => (
                  <li key={i} className={styles.bh}>
                    <div>{e.text}</div>
                    <div className={styles.bhSteps}>{stepChips([e.step])}</div>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <div className={styles.popRow}>
            <Button
              data-open="behind"
              onClick={() => {
                setOpen(false);
                setUi({ insightOpen: true, insightTab: 'behind' });
              }}
            >
              Open in the Insight panel
            </Button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
