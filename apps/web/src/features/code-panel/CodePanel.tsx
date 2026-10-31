import type { Flow, LintEntry } from '@swv/core';
import { useMemo, useRef } from 'react';

import { DEFAULT_DIAGRAM } from '../../shared/lib/defaultDiagram.ts';
import { errorLine } from '../../shared/lib/mermaidLines.ts';
import { copyWithFallback } from '../../shared/lib/files.ts';
import { cx, MERMAID_VERSION, plural } from '../../shared/lib/util.ts';
import { useDiagramStore } from '../../shared/state/diagramStore.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { Button } from '../../shared/ui/Button.tsx';
import { toast } from '../../shared/ui/toast.ts';
import styles from './codePanel.module.css';
import { Editor, type EditorHandle } from './Editor.tsx';
import { stepAtLine } from './stepAtLine.ts';
import { fixPrompt } from './fixPrompt.ts';

function StatusLine({
  code,
  flow,
  error,
  ms,
}: {
  code: string;
  flow: Flow | null;
  error: string | null;
  ms: number;
}) {
  if (error !== null) {
    const line = errorLine(code, error);
    const message = error.split('\n').slice(0, 4).join(' ').slice(0, 300);
    return (
      <div className={cx(styles.status, styles.statusErr)} data-status="error">
        <b>{line === null ? '' : `Line ${line + 1}: `}Syntax error.</b>{' '}
        <span className="mono">{message}</span>
      </div>
    );
  }
  if (!flow) return <div className={styles.status} />;
  return (
    <div className={styles.status} data-status="ok">
      {flow.isSequence ? `${plural(flow.steps.length, 'step')} · ` : ''}Rendered in {Math.round(ms)} ms
      · Mermaid {MERMAID_VERSION}
    </div>
  );
}

function LintList({ flow, onPick }: { flow: Flow | null; onPick: (entry: LintEntry) => void }) {
  const entries = useMemo<LintEntry[]>(() => {
    if (!flow) return [];
    const syntax: LintEntry[] = flow.syntax.map((s) => ({ line: s.line, msg: s.msg, code: s.code }));
    return [...flow.lint, ...syntax].sort((a, b) => a.line - b.line);
  }, [flow]);
  if (entries.length === 0) return null;
  return (
    <ul className={styles.lint} aria-label="Notes on the annotations">
      <li className={styles.lintH}>{plural(entries.length, 'note')} on the annotations</li>
      {entries.map((entry, i) => (
        <li key={`${entry.line}-${i}`}>
          <button type="button" data-lint-line={entry.line} onClick={() => onPick(entry)}>
            <span className={styles.ln}>line {entry.line + 1}:</span> {entry.msg}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The code panel: the editor with its gutter, the render status, the lint notes and the tools. */
export function CodePanel() {
  const open = useFlowStore((s) => s.ui.codeOpen);
  const setUi = useFlowStore((s) => s.setUi);
  const code = useFlowStore((s) => s.code);
  const flow = useFlowStore((s) => s.flow);
  const loadCode = useFlowStore((s) => s.loadCode);
  const go = useFlowStore((s) => s.go);
  const grid = useFlowStore((s) => s.settings.grid);
  const updateSettings = useFlowStore((s) => s.updateSettings);
  const error = useDiagramStore((s) => s.error);
  const lastRenderMs = useDiagramStore((s) => s.lastRenderMs);
  const editorRef = useRef<EditorHandle | null>(null);

  const loadExample = () => {
    loadCode(DEFAULT_DIAGRAM);
    toast('Loaded the example flow');
  };

  const copyCode = () => {
    void copyWithFallback(code, 'Copied the code');
  };

  const copyFixPrompt = () => {
    if (!flow?.isSequence) {
      toast('The fix-prompt works with sequence diagrams');
      return;
    }
    const prompt = fixPrompt(flow, code);
    void copyWithFallback(prompt.text, `Copied a fix-prompt for ${plural(prompt.missing, 'unexplained step')}`);
  };

  const pickLint = (entry: LintEntry) => {
    editorRef.current?.gotoLine(entry.line);
    const index = entry.step ?? stepAtLine(flow, entry.line)?.idx;
    if (index !== undefined) go(index, { camera: true, from: 'editor' });
  };

  return (
    <section id="codePanel" aria-label="Code" hidden={!open} className={styles.panel}>
      {open ? (
        <>
          <header className={styles.head}>
            <h2 className={styles.title}>Code</h2>
            <Button onClick={loadExample}>Load example</Button>
            <Button
              icon
              variant="ghost"
              aria-label="Close the code panel"
              onClick={() => setUi({ codeOpen: false })}
            >
              ×
            </Button>
          </header>
          <div className={styles.tools}>
            <Button onClick={copyFixPrompt}>Copy fix-prompt</Button>
            <Button pressed={grid} onClick={() => updateSettings({ grid: !grid })}>
              Grid
            </Button>
            <Button onClick={copyCode}>Copy code</Button>
          </div>
          <Editor ref={editorRef} />
          <StatusLine code={code} flow={flow} error={error} ms={lastRenderMs} />
          <LintList flow={flow} onPick={pickLint} />
        </>
      ) : null}
    </section>
  );
}
