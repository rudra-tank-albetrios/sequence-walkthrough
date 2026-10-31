import { reviewFlow, type Flow } from '@swv/core';
import { useMemo, useState } from 'react';

import { useFlowStore } from '../../shared/state/flowStore.ts';
import { flowId } from '../../shared/storage/notes.ts';
import { ExplainPanel } from './ExplainPanel.tsx';
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
      <li>A threat means &quot;possible problem, please check&quot;.</li>
      <li>This is not a security audit, and a clean result does not mean a project is safe.</li>
    </ul>
  );
}

function FlowLabel({ flow }: { flow: Flow }) {
  return (
    <p className={styles.scope} data-testid="review-scope">
      This flow: <b>{flow.title}</b>
    </p>
  );
}

function NotASequence() {
  return <p className={styles.muted}>The structure review works with sequence diagrams.</p>;
}

function Structure({ flow }: { flow: Flow }) {
  const [flowsReviewed] = useState(() => rememberReviewed(flowId(flow)));
  const review = useMemo(() => reviewFlow(flow, flowsReviewed), [flow, flowsReviewed]);
  return (
    <>
      <FlowLabel flow={flow} />
      <ResultCards review={review} />
      <Findings findings={review.findings} />
      {review.findings.length > 0 ? <ExplainPanel findings={review.findings} /> : null}
      <RulesList rules={review.rules} />
      <HonestLimits />
    </>
  );
}

/** The structure rating of the flow on screen, the confidence behind it and what the rules found. */
export function ReviewPanel() {
  const flow = useFlowStore((s) => s.flow);
  return flow?.isSequence ? <Structure flow={flow} /> : <NotASequence />;
}

/** The possible problems noted on the steps of the flow on screen. */
export function ThreatsPanel() {
  const flow = useFlowStore((s) => s.flow);
  if (!flow?.isSequence) return <NotASequence />;
  return (
    <>
      <FlowLabel flow={flow} />
      <ThreatsList threats={flow.threats} />
      <HonestLimits />
    </>
  );
}
