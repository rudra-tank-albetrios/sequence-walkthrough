import type { Flow } from '@swv/core';
import type { ComponentType } from 'react';

import { useFlowStore } from '../../shared/state/flowStore.ts';
import { BehindTab } from './BehindTab.tsx';
import { DataTab } from './DataTab.tsx';
import { EndpointsTab } from './EndpointsTab.tsx';
import { ErrorsTab } from './ErrorsTab.tsx';
import { GlossaryTab } from './GlossaryTab.tsx';
import styles from './insight.module.css';
import { LayersTab } from './LayersTab.tsx';

/** One view of the whole flow, as the overlay shows it; the overlay's tabs switch between them. */
function pane(View: ComponentType<{ flow: Flow }>) {
  return function InsightPane() {
    const flow = useFlowStore((s) => s.flow);
    return (
      <div className={styles.body} id="insightPanel" data-testid="insight">
        {flow?.isSequence ? (
          <View flow={flow} />
        ) : (
          <p className={styles.muted}>The Insight panel works with sequence diagrams.</p>
        )}
      </div>
    );
  };
}

export const LayersPane = pane(({ flow }) => <LayersTab flow={flow} steps={flow.steps} />);
export const EndpointsPane = pane(({ flow }) => <EndpointsTab flow={flow} steps={flow.steps} />);
export const ErrorsPane = pane(({ flow }) => <ErrorsTab flow={flow} steps={flow.steps} />);
export const DataPane = pane(({ flow }) => <DataTab flow={flow} steps={flow.steps} />);
export const BehindPane = pane(({ flow }) => <BehindTab flow={flow} steps={flow.steps} />);
export const GlossaryPane = pane(({ flow }) => <GlossaryTab flow={flow} />);
