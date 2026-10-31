import type { Flow } from '@swv/core';
import { useEffect, useRef } from 'react';

import { useFlowStore } from '../../shared/state/flowStore.ts';
import { announce, useLiveStore } from '../../shared/ui/announce.ts';
import { usePlay } from './usePlay.ts';

function stepSentence(flow: Flow, cur: number): string {
  const step = flow.steps[cur];
  if (!step) return `Overview. ${flow.steps.length} steps.`;
  const route = step.kind === 'self' ? `${step.fromName} to itself` : `${step.fromName} to ${step.toName}`;
  return `Step ${step.n} of ${flow.steps.length}. ${route}: ${step.label.join(' ')}. ${step.explain}`;
}

/** The screen reader line: where the walkthrough is whenever the step changes, and what `announce` says. */
function LiveRegion() {
  const flow = useFlowStore((s) => s.flow);
  const cur = useFlowStore((s) => s.cur);
  const text = useLiveStore((s) => s.text);
  const last = useRef(cur);
  useEffect(() => {
    if (last.current === cur) return;
    last.current = cur;
    if (flow?.isSequence) announce(stepSentence(flow, cur));
  }, [flow, cur]);
  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true" data-testid="live">
      {text}
    </div>
  );
}

/** What keeps working while the step bar is folded or hidden: autoplay and the screen reader line. */
export function WalkthroughRuntime() {
  usePlay();
  return <LiveRegion />;
}
