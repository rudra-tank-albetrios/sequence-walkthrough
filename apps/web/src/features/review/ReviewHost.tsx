import { lazy, Suspense } from 'react';

import { useFlowStore } from '../../shared/state/flowStore.ts';

const ReviewDialog = lazy(() =>
  import('./ReviewDialog.tsx').then((module) => ({ default: module.ReviewDialog })),
);

/** Loads the review only when `ui.reviewOpen` or `ui.threatsOpen` asks for it. */
export function ReviewHost() {
  const open = useFlowStore((s) => s.ui.reviewOpen || s.ui.threatsOpen);
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <ReviewDialog />
    </Suspense>
  );
}
