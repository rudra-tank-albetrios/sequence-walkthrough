import * as Tabs from '@radix-ui/react-tabs';
import { reviewFlow, type Flow } from '@swv/core';
import { useMemo, useState } from 'react';

import { useFlowStore } from '../../shared/state/flowStore.ts';
import { flowId } from '../../shared/storage/notes.ts';
import { Dialog } from '../../shared/ui/Dialog.tsx';
import { Findings, RulesList } from './Findings.tsx';
import { ResultCards } from './ResultCards.tsx';
import { rememberReviewed } from './reviewed.ts';
import styles from './review.module.css';
import { ThreatsList } from './ThreatsList.tsx';

/** What the review can and cannot say. Always on screen (plan section 8.11). */
function HonestLimits() {
  return (
    <ul className={styles.limits} data-testid="review-limits">
      <li>This rates this flow only. One flow cannot rate a whole project.</li>
      <li>A threat means "possible problem, please check".</li>
      <li>This is not a security audit, and a clean result does not mean a project is safe.</li>
    </ul>
  );
}

function ReviewBody({ flow, firstTab }: { flow: Flow; firstTab: 'structure' | 'threats' }) {
  const [flowsReviewed] = useState(() => rememberReviewed(flowId(flow)));
  const review = useMemo(() => reviewFlow(flow, flowsReviewed), [flow, flowsReviewed]);
  return (
    <>
      <Tabs.Root defaultValue={firstTab}>
        <Tabs.List className={styles.tabs} aria-label="Review">
          <Tabs.Trigger className={styles.tab} value="structure">
            Structure
          </Tabs.Trigger>
          <Tabs.Trigger className={styles.tab} value="threats">
            Threats ({review.threats.length})
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content className={styles.panel} value="structure">
          <ResultCards review={review} />
          <Findings findings={review.findings} />
          <RulesList rules={review.rules} />
        </Tabs.Content>
        <Tabs.Content className={styles.panel} value="threats">
          <ThreatsList threats={review.threats} />
        </Tabs.Content>
      </Tabs.Root>
      <HonestLimits />
    </>
  );
}

/** The structure rating, the confidence behind it and the threats, for the flow on screen. */
export function ReviewDialog() {
  const threatsOpen = useFlowStore((s) => s.ui.threatsOpen);
  const flow = useFlowStore((s) => s.flow);
  const setUi = useFlowStore((s) => s.setUi);
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) setUi({ reviewOpen: false, threatsOpen: false });
      }}
      title={flow?.isSequence ? `This flow: ${flow.title}` : 'This flow'}
      description="A rating of how well this flow follows its layers, how much evidence supports it, and the possible problems noted on its steps."
      size="wide"
    >
      {flow?.isSequence ? (
        <ReviewBody flow={flow} firstTab={threatsOpen ? 'threats' : 'structure'} />
      ) : (
        <p className={styles.muted}>The structure review works with sequence diagrams.</p>
      )}
    </Dialog>
  );
}
