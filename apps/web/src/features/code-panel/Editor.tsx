import type { Flow, Step } from '@swv/core';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';

import { useIsNarrow } from '../../shared/hooks/useMediaQuery.ts';
import { LIVE_LINK_RE, readLiveState } from '../../shared/lib/codec.ts';
import { errorLine } from '../../shared/lib/mermaidLines.ts';
import { cx, debounce } from '../../shared/lib/util.ts';
import { useDiagramStore } from '../../shared/state/diagramStore.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { toast } from '../../shared/ui/toast.ts';
import styles from './codePanel.module.css';
import { highlightLine } from './highlight.tsx';
import { stepAtLine } from './stepAtLine.ts';

/** The editor draws 20 px lines under 10 px of padding; the gutter and the overlay match. */
const LINE_HEIGHT = 20;
const PAD_TOP = 10;
const EDIT_DEBOUNCE_MS = 300;

export interface EditorHandle {
  /** Selects a line, scrolls it into view and focuses the textarea. */
  gotoLine: (line: number) => void;
}

interface LineMarks {
  /** Arrow lines and their step. */
  stepAt: Map<number, Step>;
  /** Chapter hue of every line that belongs to a step. */
  hueAt: Map<number, number>;
  annotation: Set<number>;
  warn: Set<number>;
  cur: Set<number>;
}

function lineMarks(flow: Flow | null, cur: number): LineMarks {
  const marks: LineMarks = {
    stepAt: new Map(),
    hueAt: new Map(),
    annotation: new Set(),
    warn: new Set(),
    cur: new Set(),
  };
  if (!flow) return marks;
  for (const step of flow.steps) {
    const hue = flow.sections[step.section]?.hue;
    if (step.line >= 0) {
      marks.stepAt.set(step.line, step);
      if (hue !== undefined) marks.hueAt.set(step.line, hue);
    }
    for (const line of step.annLines) {
      if (line < 0) continue;
      marks.annotation.add(line);
      if (hue !== undefined) marks.hueAt.set(line, hue);
    }
  }
  for (const entry of flow.lint) marks.warn.add(entry.line);
  for (const issue of flow.syntax) marks.warn.add(issue.line);
  const current = flow.steps[cur];
  if (current) {
    for (const line of [current.line, ...current.annLines]) if (line >= 0) marks.cur.add(line);
  }
  return marks;
}

/**
 * The code editor: a transparent textarea over a coloured copy of the text, with a gutter. Typing
 * re-parses after a short pause; the caret selects the step it sits in; the step selected
 * elsewhere scrolls its line into view.
 */
export const Editor = forwardRef<EditorHandle>(function Editor(_props, ref) {
  const code = useFlowStore((s) => s.code);
  const flow = useFlowStore((s) => s.flow);
  const cur = useFlowStore((s) => s.cur);
  const lastGo = useFlowStore((s) => s.lastGo);
  const setCode = useFlowStore((s) => s.setCode);
  const go = useFlowStore((s) => s.go);
  const error = useDiagramStore((s) => s.error);
  const narrow = useIsNarrow();

  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const hlRef = useRef<HTMLPreElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const pasted = useRef(false);
  const caretLine = useRef(-1);
  const [text, setText] = useState(code);
  const textRef = useRef(code);

  useEffect(() => {
    textRef.current = text;
  }, [text]);

  const flush = useMemo(
    () =>
      debounce((value: string) => {
        setCode(value);
      }, EDIT_DEBOUNCE_MS),
    [setCode],
  );

  // The code changed outside the editor (Load example, a link, an import): show it.
  useEffect(() => {
    if (code !== textRef.current) {
      flush.cancel();
      setText(code);
    }
  }, [code, flush]);

  // Closing the panel right after typing must not lose the edit.
  useEffect(
    () => () => {
      flush.cancel();
      const pending = textRef.current;
      if (pending !== useFlowStore.getState().code) setCode(pending);
    },
    [flush, setCode],
  );

  useEffect(() => {
    if (!narrow) taRef.current?.focus({ preventScroll: true });
  }, [narrow]);

  const syncScroll = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    if (hlRef.current) {
      hlRef.current.scrollTop = ta.scrollTop;
      hlRef.current.scrollLeft = ta.scrollLeft;
    }
    if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
  }, []);

  useEffect(syncScroll, [text, syncScroll]);

  const scrollToLine = useCallback(
    (line: number) => {
      const ta = taRef.current;
      if (!ta) return;
      const y = PAD_TOP + line * LINE_HEIGHT;
      const low = ta.scrollTop + LINE_HEIGHT;
      const high = ta.scrollTop + ta.clientHeight - 2 * LINE_HEIGHT;
      if (y < low || y > high) ta.scrollTop = Math.max(0, y - ta.clientHeight * 0.4);
      syncScroll();
    },
    [syncScroll],
  );

  // A step chosen in the diagram, the bar or the table: bring its arrow line into view.
  useEffect(() => {
    if (lastGo.from === 'editor') return;
    const step = useFlowStore.getState().flow?.steps[lastGo.index];
    if (step && step.line >= 0) scrollToLine(step.line);
  }, [lastGo, scrollToLine]);

  useImperativeHandle(
    ref,
    () => ({
      gotoLine(line) {
        const ta = taRef.current;
        if (!ta) return;
        const lines = ta.value.split('\n');
        let pos = 0;
        for (let i = 0; i < line && i < lines.length; i++) pos += (lines[i]?.length ?? 0) + 1;
        ta.focus({ preventScroll: true });
        ta.setSelectionRange(pos, pos + (lines[line]?.length ?? 0));
        caretLine.current = line;
        scrollToLine(line);
      },
    }),
    [scrollToLine],
  );

  const onCaret = () => {
    const ta = taRef.current;
    if (!ta) return;
    const line = ta.value.slice(0, ta.selectionStart).split('\n').length - 1;
    if (line === caretLine.current) return;
    caretLine.current = line;
    const step = stepAtLine(flow, line);
    if (step && step.idx !== cur) go(step.idx, { camera: true, from: 'editor' });
  };

  const onChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    setText(value);
    if (pasted.current) {
      pasted.current = false;
      flush.cancel();
      setCode(value);
    } else {
      flush(value);
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const match = LIVE_LINK_RE.exec(event.clipboardData.getData('text'));
    if (!match) {
      pasted.current = true;
      return;
    }
    event.preventDefault();
    const kind = match[1] === 'base64' ? 'base64' : 'pako';
    void readLiveState(kind, match[2] ?? '')
      .then((state) => {
        if (!state.code) throw new Error('The link holds no code');
        flush.cancel();
        setText(state.code);
        setCode(state.code);
        toast('Loaded the diagram from the mermaid.live link');
      })
      .catch(() => {
        toast('Could not read the mermaid.live link');
      });
  };

  const onKeyUp = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (/^(Arrow|Page|Home|End)/.test(event.key)) onCaret();
  };

  const lines = useMemo(() => text.split('\n'), [text]);
  const coloured = useMemo(() => lines.map((line) => highlightLine(line)), [lines]);
  const marks = useMemo(() => lineMarks(flow, cur), [flow, cur]);
  const err = error === null ? null : errorLine(code, error);

  return (
    <div className={styles.editor}>
      <div
        ref={gutterRef}
        className={styles.gutter}
        aria-hidden="true"
        onWheel={(event) => {
          if (taRef.current) {
            taRef.current.scrollTop += event.deltaY;
            syncScroll();
          }
        }}
      >
        {lines.map((_line, i) => {
          const step = marks.stepAt.get(i);
          const hue = marks.hueAt.get(i);
          const isCur = marks.cur.has(i);
          const isErr = i === err;
          return (
            <div
              key={i}
              className={cx(
                styles.g,
                isErr && styles.gErr,
                isCur && styles.gCur,
                marks.warn.has(i) && styles.gWarn,
                hue !== undefined && styles.gCh,
              )}
              style={hue === undefined ? undefined : ({ '--ch': hue } as CSSProperties)}
              data-line={i}
              data-cur={isCur || undefined}
              data-err={isErr || undefined}
              data-warn={marks.warn.has(i) || undefined}
            >
              <span className={styles.gMark}>{step ? step.n : marks.annotation.has(i) ? '•' : ''}</span>
              <span className={styles.gLn}>{i + 1}</span>
            </div>
          );
        })}
        <div className={styles.g} />
        <div className={styles.g} />
      </div>
      <div className={styles.wrap}>
        <pre ref={hlRef} className={styles.hl} aria-hidden="true">
          {coloured.map((node, i) => (
            <span
              key={i}
              className={cx(styles.l, marks.cur.has(i) && styles.lCur, i === err && styles.lErr)}
            >
              {node}
              {lines[i] ? null : ' '}
            </span>
          ))}
          <span className={styles.l}> </span>
        </pre>
        <textarea
          ref={taRef}
          id="code"
          className={styles.ta}
          aria-label="Diagram code"
          spellCheck={false}
          wrap="off"
          autoCapitalize="off"
          value={text}
          onChange={onChange}
          onPaste={onPaste}
          onScroll={syncScroll}
          onClick={onCaret}
          onKeyUp={onKeyUp}
        />
      </div>
    </div>
  );
});
