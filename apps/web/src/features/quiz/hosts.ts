import { grantConsent, loadModelState, modelHost, modelProblem, type ModelEntry } from '@swv/ai';

/**
 * Where a quiz request can go: the active model and the ones marked as fallbacks, the models
 * `callModel` routes to. The set-up screen names these hosts before anything is sent (plan
 * section 4), and pressing Start records that the notice was read, so the request is not refused
 * for a missing notice. No other screen shows one while the model list of plan 8.1 is not built.
 */
function reachable(): ModelEntry[] {
  const state = loadModelState();
  return state.models.filter(
    (model) => (model.id === state.activeId || model.fallback) && modelProblem(model) === null,
  );
}

/** The hosts, in route order, each once. */
export const modelHosts = (): string[] => [...new Set(reachable().map(modelHost))];

export function announceHosts(): void {
  grantConsent(reachable());
}
