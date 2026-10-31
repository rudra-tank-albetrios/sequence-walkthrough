import type { Flow } from '@swv/core';

import { useFlowStore } from '../../shared/state/flowStore.ts';

/** Tells screen readers where the walkthrough is whenever the step changes. */
export function LiveRegion({ flow }: { flow: Flow }) {
  const cur = useFlowStore((s) => s.cur);
  const step = flow.steps[cur];
  const text = step
    ? `Step ${step.n} of ${flow.steps.length}. ${
        step.kind === 'self' ? `${step.fromName} to itself` : `${step.fromName} to ${step.toName}`
      }: ${step.label.join(' ')}. ${step.explain}`
    : `Overview. ${flow.steps.length} steps.`;
  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true" data-testid="live">
      {text}
    </div>
  );
}
