import { useCallback, useEffect, useRef, useState } from 'react';

import type { WeakPoint } from '../../shared/storage/weakPoints.ts';
import { buildRecapPrompt, parseRecapReply, RECAP_REPLY_TOKENS, RECAP_SYSTEM } from './analysis.ts';
import { recapModel } from './recapModel.ts';
import {
  isCurrent,
  liveGroups,
  loadSavedAnalysis,
  newSavedAnalysis,
  saveAnalysis,
  type SavedAnalysis,
} from './savedAnalysis.ts';

export type AnalysisView =
  | { status: 'loading' }
  /** Nothing to show. `stale` says a saved analysis exists, older than the newest mistakes. */
  | { status: 'none'; stale: boolean }
  | { status: 'busy' }
  | { status: 'saved'; saved: SavedAnalysis }
  | { status: 'error'; message: string };

const BAD_REPLY = 'The model replied in a form this page cannot read, so nothing was saved.';

function viewOfSaved(
  saved: SavedAnalysis | null,
  mistakes: readonly WeakPoint[],
): AnalysisView {
  if (!saved) return { status: 'none', stale: false };
  if (!isCurrent(saved, mistakes)) return { status: 'none', stale: true };
  if (liveGroups(saved.groups, mistakes).length === 0) return { status: 'none', stale: false };
  return { status: 'saved', saved };
}

/**
 * The analysis of the mistakes one selection covers. Opening only reads what is saved: a request
 * goes out only from `analyse`, which the person starts after seeing what would be sent.
 */
export function useAnalysis(
  key: string,
  mistakes: readonly WeakPoint[],
): { view: AnalysisView; analyse: () => void } {
  const [state, setState] = useState<{ key: string; view: AnalysisView } | null>(null);
  const running = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadSavedAnalysis(key).then((saved) => {
      if (!cancelled) setState({ key, view: viewOfSaved(saved, mistakes) });
    });
    return () => {
      cancelled = true;
      running.current?.abort();
    };
  }, [key, mistakes]);

  const analyse = useCallback(() => {
    const model = recapModel();
    if (!model) return;
    const controller = new AbortController();
    running.current = controller;
    const show = (view: AnalysisView) => {
      if (!controller.signal.aborted) setState({ key, view });
    };
    show({ status: 'busy' });
    const { user, sentIds } = buildRecapPrompt(mistakes);
    const run = async () => {
      const reply = await model.send({
        system: RECAP_SYSTEM,
        user,
        maxTokens: RECAP_REPLY_TOKENS,
        signal: controller.signal,
      });
      const groups = parseRecapReply(reply, sentIds);
      if (!groups) {
        show({ status: 'error', message: BAD_REPLY });
        return;
      }
      const saved = newSavedAnalysis(groups, mistakes, sentIds.length, model.name, new Date());
      await saveAnalysis(key, saved);
      show({ status: 'saved', saved });
    };
    run().catch((error: unknown) => {
      show({ status: 'error', message: error instanceof Error ? error.message : String(error) });
    });
  }, [key, mistakes]);

  const view: AnalysisView = state?.key === key ? state.view : { status: 'loading' };
  return { view, analyse };
}
