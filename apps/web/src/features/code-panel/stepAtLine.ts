import type { Flow, Step } from '@swv/core';

/** The step whose arrow line or annotation lines include a source line. */
export function stepAtLine(flow: Flow | null, line: number): Step | undefined {
  return flow?.steps.find((s) => s.line === line || s.annLines.includes(line));
}
