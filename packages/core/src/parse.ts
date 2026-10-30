import { parseAnnotations } from './annotations.ts';
import { buildFlow } from './flow.ts';
import { parseSequence } from './sequence.ts';
import type { Annotations, Flow, SequenceInfo } from './types.ts';

export interface ParsedFlow {
  annotations: Annotations;
  info: SequenceInfo | null;
  flow: Flow;
}

/** Everything the viewer needs from a diagram's code, in one call. */
export function parseFlow(code: string): ParsedFlow {
  const annotations = parseAnnotations(code);
  const info = parseSequence(code);
  return { annotations, info, flow: buildFlow(annotations, info) };
}
