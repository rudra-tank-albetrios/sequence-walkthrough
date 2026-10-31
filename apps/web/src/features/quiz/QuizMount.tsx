import { Component, lazy, Suspense, useState, type ReactNode } from 'react';

import { useFlowStore } from '../../shared/state/flowStore.ts';
import { toast } from '../../shared/ui/toast.ts';

const QuizScreens = lazy(() => import('./QuizScreens.tsx'));

/** A chunk that cannot be fetched (offline, or a new deploy) must not take the page down with it. */
class ChunkBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch() {
    toast('The quiz could not load. Reload the page and try again.');
    useFlowStore.getState().setUi({ quizOpen: false, weakPointsOpen: false });
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Opens through the store. Loads the screens the first time they are wanted, then keeps them. */
export function QuizMount() {
  const wanted = useFlowStore((s) => s.ui.quizOpen || s.ui.weakPointsOpen);
  const [loaded, setLoaded] = useState(false);
  if (wanted && !loaded) setLoaded(true);
  if (!wanted && !loaded) return null;
  return (
    <ChunkBoundary>
      <Suspense fallback={null}>
        <QuizScreens />
      </Suspense>
    </ChunkBoundary>
  );
}
