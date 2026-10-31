import { hashStr } from '@swv/core';

import { REPLY_TOKENS } from './budgets.ts';
import { TextReply, type ModelRequest } from './call.ts';
import { ASK_SYSTEM, askPrompt, stepSummary, type StepContext } from './prompts.ts';

/**
 * `askRequest(question: string, context: StepContext | null): ModelRequest<string>`
 *
 * The Ask AI request for `callModel`, within its 220-token budget. With a context the model is told
 * about the step, and the answer is saved against that text, so a step whose text changed asks
 * again while the other steps keep their answers. Without one, only the question is sent.
 */
export function askRequest(question: string, context: StepContext | null): ModelRequest<string> {
  return {
    system: ASK_SYSTEM,
    prompt: askPrompt(question, context),
    maxTokens: REPLY_TOKENS.ask,
    schema: TextReply,
    format: 'text',
    cache: context
      ? { flowVersion: hashStr(stepSummary(context)), step: context.step.n, question, mode: 'project' }
      : { flowVersion: '', step: 'general', question, mode: 'general' },
  };
}
