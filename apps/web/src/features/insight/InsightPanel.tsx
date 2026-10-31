import * as Tabs from '@radix-ui/react-tabs';
import type { Flow } from '@swv/core';
import { useEffect, useRef } from 'react';

import { useFlowStore, type InsightTab } from '../../shared/state/flowStore.ts';
import { allTerms, useGlossaryStore } from '../../shared/state/glossaryStore.ts';
import { Button } from '../../shared/ui/Button.tsx';
import { BehindTab } from './BehindTab.tsx';
import { DataTab } from './DataTab.tsx';
import { endpointList } from './derive.ts';
import { EndpointsTab } from './EndpointsTab.tsx';
import { ErrorsTab } from './ErrorsTab.tsx';
import { GlossaryTab } from './GlossaryTab.tsx';
import styles from './insight.module.css';
import { LayersTab } from './LayersTab.tsx';

const TABS: [InsightTab, string][] = [
  ['layers', 'Layers'],
  ['endpoints', 'Endpoints'],
  ['errors', 'Errors'],
  ['behind', 'Behind the scenes'],
  ['glossary', 'Glossary'],
  ['data', 'Data'],
];

function TabBody({ tab, flow }: { tab: InsightTab; flow: Flow }) {
  const steps = flow.steps;
  switch (tab) {
    case 'layers':
      return <LayersTab flow={flow} steps={steps} />;
    case 'endpoints':
      return <EndpointsTab flow={flow} steps={steps} />;
    case 'errors':
      return <ErrorsTab flow={flow} steps={steps} />;
    case 'behind':
      return <BehindTab flow={flow} steps={steps} />;
    case 'glossary':
      return <GlossaryTab flow={flow} />;
    case 'data':
      return <DataTab flow={flow} steps={steps} />;
  }
}

/** The whole flow at a glance: layers, endpoints, errors, side parts, glossary and data. */
export function InsightPanel() {
  const open = useFlowStore((s) => s.ui.insightOpen);
  const tab = useFlowStore((s) => s.ui.insightTab);
  const setUi = useFlowStore((s) => s.setUi);
  const flow = useFlowStore((s) => s.flow);
  const saved = useGlossaryStore((s) => s.saved);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const wasOpen = useRef(false);

  // Opening moves the focus into the panel, closing gives it back to the canvas.
  useEffect(() => {
    if (open) bodyRef.current?.querySelector<HTMLElement>('button, a')?.focus({ preventScroll: true });
    else if (wasOpen.current) {
      document.querySelector<HTMLElement>('[data-testid="diagram"]')?.focus({ preventScroll: true });
    }
    wasOpen.current = open;
  }, [open]);

  if (!open) return null;
  const sequence = flow?.isSequence ? flow : null;
  const counts: Partial<Record<InsightTab, number>> = sequence
    ? {
        layers: sequence.participants.length,
        endpoints: endpointList(sequence.steps).length,
        errors: sequence.steps.filter((s) => s.isError).length + sequence.unconfirmed,
        behind: sequence.uses.length + sequence.effects.length,
        glossary: allTerms(sequence, saved).length,
        data: sequence.data.length,
      }
    : {};
  return (
    <aside className={styles.panel} id="insightPanel" aria-label="Insight" data-testid="insight">
      <div className={styles.head}>
        <h2 className={styles.title}>Insight</h2>
        <Button
          variant="ghost"
          icon
          aria-label="Close the Insight panel"
          onClick={() => {
            setUi({ insightOpen: false });
          }}
        >
          ×
        </Button>
      </div>
      <Tabs.Root
        className={styles.tabs}
        value={tab}
        onValueChange={(value) => {
          setUi({ insightTab: value as InsightTab });
        }}
      >
        <Tabs.List className={styles.list} aria-label="Insight sections">
          {TABS.map(([key, label]) => {
            const n = counts[key];
            return (
              <Tabs.Trigger key={key} value={key} className={styles.tab}>
                {label}
                {n ? <span className={styles.n}>{n}</span> : null}
              </Tabs.Trigger>
            );
          })}
        </Tabs.List>
        <Tabs.Content ref={bodyRef} value={tab} className={styles.body}>
          {sequence ? (
            <TabBody tab={tab} flow={sequence} />
          ) : (
            <p className={styles.muted}>The Insight panel works with sequence diagrams.</p>
          )}
        </Tabs.Content>
      </Tabs.Root>
    </aside>
  );
}
