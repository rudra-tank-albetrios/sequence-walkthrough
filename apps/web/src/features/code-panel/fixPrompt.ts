import type { Flow } from '@swv/core';

export interface FixPrompt {
  text: string;
  /** How many arrows have no `@step` line. */
  missing: number;
}

/**
 * The prompt the "Copy fix-prompt" button puts on the clipboard: asks the skill to add the missing
 * `@step` lines and fix the other lint notes without touching the arrows (docs/v2-internals.md §7).
 */
export function fixPrompt(flow: Flow, code: string): FixPrompt {
  const missing = flow.lint.filter((entry) => entry.code === 'no-step');
  const other = flow.lint.filter((entry) => entry.code !== 'no-step');
  const lines = [
    `Use the sequence-walkthrough skill in update mode on this Mermaid sequence diagram ("${flow.title}", format walkthrough/2).`,
    'Keep every arrow, label and the arrow order exactly as they are. Only add or fix annotations.',
    '',
  ];
  if (missing.length > 0) {
    lines.push('Add a %% @step line (what happens and why, 1-2 sentences) directly above these arrows:');
    for (const entry of missing) {
      const step = entry.step === undefined ? undefined : flow.steps[entry.step];
      if (!step) continue;
      lines.push(
        `- Step ${step.n}, line ${step.line + 1}: ${step.fromName} → ${step.toName}: ${step.label.join(' / ')}`,
      );
    }
  } else {
    lines.push('Every arrow already has a @step.');
  }
  if (other.length > 0) {
    lines.push('', 'Also fix these notes from the viewer:');
    for (const entry of other) lines.push(`- Line ${entry.line + 1}: ${entry.msg}`);
  }
  lines.push(
    '',
    "Check it by piping it into validate.py on stdin (don't create a file), then return the full updated code in one ```mermaid block.",
    '',
    '```mermaid',
    code,
    '```',
  );
  return { text: lines.join('\n'), missing: missing.length };
}
