import { callModel as callShared, type ModelRequest as SharedRequest, type ModelResult } from '@swv/ai';

export { asData, z, type ModelResult } from '@swv/ai';

/**
 * The one place the review reaches a model: `@swv/ai`, so a reply is validated and each key goes
 * only to its own URL. The answer is saved under the whole request, so a changed finding list is
 * asked again.
 */
export type ModelRequest<T> = Omit<SharedRequest<T>, 'cache' | 'format'>;

export function callModel<T>(request: ModelRequest<T>): Promise<ModelResult<T>> {
  return callShared({
    ...request,
    cache: {
      flowVersion: '',
      step: 'review',
      question: `${request.system}\n\n${request.prompt}`,
      mode: 'review',
    },
  });
}
