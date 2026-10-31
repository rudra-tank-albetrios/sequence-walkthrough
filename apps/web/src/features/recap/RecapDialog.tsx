import { lazy, Suspense } from 'react';

import { useFlowStore } from '../../shared/state/flowStore.ts';
import { Dialog } from '../../shared/ui/Dialog.tsx';

// Zod, the model package and the storage code load with the recap, not with the page.
const RecapBody = lazy(() =>
  import('./RecapBody.tsx').then(({ RecapBody: Body }) => ({ default: Body })),
);

/** The day recap: wrong quiz answers by period and flow, with key points from the user's model. */
export function RecapDialog() {
  const open = useFlowStore((s) => s.ui.recapOpen);
  const setUi = useFlowStore((s) => s.setUi);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setUi({ recapOpen: false });
      }}
      title="Day recap"
      description="Your wrong quiz answers with the correct ones, by period and flow, and short key points from your model."
      size="wide"
    >
      {open ? (
        <Suspense fallback={null}>
          <RecapBody />
        </Suspense>
      ) : null}
    </Dialog>
  );
}
