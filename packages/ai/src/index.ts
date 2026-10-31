/**
 * Model clients, usage tracking, auto-switch, the answer cache, prompts and reply schemas.
 * Depends only on @swv/core. Plan sections 8.1 to 8.4.
 *
 * For a feature that needs a model, these are the stable entry points (see each one's comment):
 *
 *   callModel<T>(request: ModelRequest<T>): Promise<ModelResult<T>>
 *     One call: token budget, Zod validation, answer cache, auto-switch, usage. Returns data or a
 *     typed error, and never throws for a model or network problem.
 *   flowSummary(flow: Flow, options?: { maxTokens?: number }): string
 *     The whole flow for a prompt, at most about 1,500 tokens, never the diagram code.
 *   stepSummary(context: StepContext): string
 *     One step for a prompt, within the same budget.
 *   asData(title: string, body: string): string
 *     Marks flow text as data in a prompt.
 *   flowVersion(flow: Flow): string
 *     The `flowVersion` of an answer-cache key.
 *   hasUsableModel(): boolean
 *     Whether a saved model can be asked now, for a feature with a no-model mode.
 *   receivingModels(state: ModelState): ModelEntry[]
 *     The models that could receive text now, which the privacy notice names.
 *   REPLY_TOKENS, FLOW_SUMMARY_TOKENS, MAX_PROMPT_TOKENS, estimateTokens
 *     The budgets of plan section 5.
 *   z
 *     Zod, so a feature can write its reply schema without its own dependency.
 *
 * Tests: `@swv/ai/testing` has `mockModel`, which stubs fetch and seeds a model.
 */
export { z } from 'zod';

export {
  clampTokens,
  estimateTokens,
  FLOW_SUMMARY_TOKENS,
  MAX_PROMPT_TOKENS,
  REPLY_TOKENS,
} from './budgets.ts';
export {
  answerCacheInfo,
  clearAnswerCache,
  normaliseQuestion,
  type AnswerCacheInfo,
  type AnswerKey,
} from './cache.ts';
export {
  callModel,
  TextReply,
  type ModelError,
  type ModelErrorKind,
  type ModelRef,
  type ModelRequest,
  type ModelResult,
} from './call.ts';
export { askRequest } from './ask.ts';
export { testModel, type ModelCheck } from './check.ts';
export { consentMissing, grantConsent, modelHost } from './consent.ts';
export {
  applyEdit,
  DEFAULT_SWITCH_AT,
  endpointUrl,
  hasClaudeHost,
  hasUsableModel,
  loadModelState,
  modelProblem,
  newModel,
  saveModelState,
  urlProblem,
  type ModelEntry,
  type ModelLimits,
  type ModelState,
} from './models.ts';
export { isPresetId, PRESETS, presetFor, type Preset, type PresetId } from './presets.ts';
export {
  askPrompt,
  ASK_SYSTEM,
  asData,
  flowSummary,
  flowVersion,
  stepSummary,
  type FlowSummaryOptions,
  type PromptTerm,
  type StepContext,
} from './prompts.ts';
export { receivingModels } from './route.ts';
export { onAiChange } from './storage.ts';
export {
  formatReset,
  forgetUsage,
  loadUsage,
  usageLevel,
  usageView,
  type UsageLevel,
  type UsageRecord,
  type UsageSource,
  type UsageView,
} from './usage.ts';
