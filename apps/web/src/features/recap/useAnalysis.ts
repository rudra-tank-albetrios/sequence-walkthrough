import { useCallback, useEffect, useRef, useState } from 'react';

import { useFlowStore } from '../../shared/state/flowStore.ts';
import type { WeakPoint } from '../../shared/storage/weakPoints.ts';
import { toast } from '../../shared/ui/toast.ts';
import { buildRecapPrompt, groupsFromReply, RECAP_SYSTEM, RecapReplySchema } from './analysis.ts';
import { callModel, REPLY_TOKENS } from './recapModel.ts';
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

function viewOfSaved(saved: SavedAnalysis | null, mistakes: readonly WeakPoint[]): AnalysisView {
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
    const controller = new AbortController();
    running.current = controller;
    const show = (view: AnalysisView) => {
      if (!controller.signal.aborted) setState({ key, view });
    };
    show({ status: 'busy' });
    const { prompt, sentIds } = buildRecapPrompt(mistakes);
    const run = async () => {
      const result = await callModel({
        system: RECAP_SYSTEM,
        prompt,
        maxTokens: REPLY_TOKENS.recap,
        schema: RecapReplySchema,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      for (const notice of result.notices) toast(notice);
      if (result.ok) {
        const groups = groupsFromReply(result.data, sentIds);
        const model = `${result.model.name} · ${result.model.model}`;
        const saved = newSavedAnalysis(groups, mistakes, sentIds.length, model, new Date());
        await saveAnalysis(key, saved);
        show({ status: 'saved', saved });
      } else if (result.error.kind === 'no-model' || result.error.kind === 'consent-needed') {
        // The settings dialog sets up a model and says what goes where. The person then asks again.
        useFlowStore.getState().setUi({ aiSettingsOpen: true });
        show({ status: 'none', stale: false });
      } else {
        show({ status: 'error', message: result.error.message });
      }
    };
    void run();
  }, [key, mistakes]);

  const view: AnalysisView = state?.key === key ? state.view : { status: 'loading' };
  return { view, analyse };
}
