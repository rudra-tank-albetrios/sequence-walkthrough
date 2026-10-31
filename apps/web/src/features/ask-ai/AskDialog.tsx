import { grantConsent, modelProblem, type ModelEntry } from '@swv/ai';
import type { Flow, Step } from '@swv/core';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useFlowStore } from '../../shared/state/flowStore.ts';
import { allTerms, useGlossaryStore } from '../../shared/state/glossaryStore.ts';
import { announce } from '../../shared/ui/announce.ts';
import { Button } from '../../shared/ui/Button.tsx';
import { Chip } from '../../shared/ui/Chip.tsx';
import { Dialog } from '../../shared/ui/Dialog.tsx';
import { toast } from '../../shared/ui/toast.ts';
import { useAiSettingsStore, type AskMode } from './aiSettings.ts';
import { useAiStore } from './aiStore.ts';
import { appendAnswerToNote, askModel, termOf } from './ask.ts';
import { AskAnswer, type Answer } from './AskAnswer.tsx';
import { suggestedChips } from './chips.ts';
import { ModelPicker } from './ModelPicker.tsx';
import { PrivacyNotice } from './PrivacyNotice.tsx';
import { UsageBars } from './UsageBars.tsx';
import styles from './ask.module.css';

/** Short answers about the current step from the model the person chose (`A`, or the card's button). */
export function AskDialog() {
  const open = useFlowStore((s) => s.ui.askOpen);
  const setUi = useFlowStore((s) => s.setUi);
  const flow = useFlowStore((s) => s.flow);
  const cur = useFlowStore((s) => s.cur);
  const step = flow?.isSequence ? flow.steps[cur] : undefined;
  const shown = open && step !== undefined;
  return (
    <Dialog
      open={shown}
      onOpenChange={(next) => {
        if (!next) setUi({ askOpen: false });
      }}
      title={`Ask AI about step ${step?.n ?? ''}`}
      description="Pick a suggested question or type your own. The answer is under 60 words."
      size="narrow"
    >
      {shown && flow ? <AskBody flow={flow} step={step} /> : null}
    </Dialog>
  );
}

const MODES: { id: AskMode; label: string; title: string }[] = [
  { id: 'project', label: 'In this project', title: "The answer uses this step's label, text, payload and layers" },
  { id: 'general', label: 'In general', title: 'Only the question is sent' },
];

const writerOf = ({ name, model }: { name: string; model: string }): string =>
  model && model !== name ? `${name} · ${model}` : name;

/** A question waiting for the person to read the privacy notice. */
interface Waiting {
  q: string;
  fresh: boolean;
  models: readonly ModelEntry[];
}

/** Mounted while the panel is open, so the question and answer start fresh each time. */
function AskBody({ flow, step }: { flow: Flow; step: Step }) {
  const setUi = useFlowStore((s) => s.setUi);
  const settings = useAiSettingsStore((s) => s.settings);
  const update = useAiSettingsStore((s) => s.update);
  const models = useAiStore((s) => s.state.models);
  const activeId = useAiStore((s) => s.state.activeId);
  const saved = useGlossaryStore((s) => s.saved);
  const terms = useMemo(() => allTerms(flow, saved), [flow, saved]);
  const chips = useMemo(() => suggestedChips(step, terms), [step, terms]);
  const [prefill] = useState(() => {
    const prepared = useFlowStore.getState().ui.askQuestion ?? '';
    if (prepared) useFlowStore.getState().setUi({ askQuestion: null });
    return prepared;
  });
  const [question, setQuestion] = useState(prefill);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [waiting, setWaiting] = useState<Waiting | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const active = models.find((m) => m.id === activeId);
  const usable = models.some((m) => !modelProblem(m));

  const run = async (raw: string, fresh = false) => {
    const q = raw.trim();
    if (!q) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const base: Answer = { q, term: termOf(q), status: 'busy', text: '', cached: false, writer: '', noted: false, notices: [] };
    setWaiting(null);
    setAnswer(base);
    const result = await askModel({ flow, step, terms, settings, question: q, fresh, signal: controller.signal });
    if (controller.signal.aborted) return;
    if (result.ok) {
      if (settings.autoNote) appendAnswerToNote(step, q, result.data);
      setAnswer({
        ...base,
        status: 'done',
        text: result.data,
        cached: result.cached,
        writer: writerOf(result.model),
        noted: settings.autoNote,
        notices: result.notices,
      });
      return;
    }
    const { error, notices } = result;
    if (error.kind === 'consent-needed') {
      setAnswer(null);
      setWaiting({ q, fresh, models: error.models ?? [] });
      announce(error.message);
    } else if (error.kind === 'no-model') {
      setAnswer(null);
      setUi({ aiSettingsOpen: true });
    } else {
      setAnswer({ ...base, status: 'error', text: error.message, notices });
    }
  };

  // The run closure changes every render; the ref lets the mount-only effect below call the latest one.
  const runRef = useRef<typeof run | null>(null);
  useEffect(() => {
    runRef.current = run;
  });

  // A question another feature prepared (a term popover, the Follow strip) is sent right away.
  useEffect(() => {
    inputRef.current?.focus();
    if (!prefill) return;
    const id = setTimeout(() => {
      void runRef.current?.(prefill);
    }, 0);
    return () => {
      clearTimeout(id);
    };
  }, [prefill]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const ask = (text: string, fresh = false) => {
    setQuestion(text);
    void run(text, fresh);
  };

  return (
    <div className={styles.ask}>
      <div className={styles.top}>
        <span className={styles.seg} role="group" aria-label="Question mode">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={settings.mode === m.id}
              title={m.title}
              onClick={() => {
                update({ mode: m.id });
              }}
            >
              {m.label}
            </button>
          ))}
        </span>
        <span className={styles.models}>
          <ModelPicker />
          <button
            type="button"
            className={styles.link}
            title="Models, keys and limits"
            onClick={() => {
              setUi({ aiSettingsOpen: true });
            }}
          >
            AI settings ⚙
          </button>
        </span>
      </div>
      <UsageBars />
      {usable ? null : (
        <p className={styles.setup}>
          {active ? modelProblem(active) : 'No AI model set up yet.'}{' '}
          <button
            type="button"
            className={styles.link}
            onClick={() => {
              setUi({ aiSettingsOpen: true });
            }}
          >
            {active ? 'Open AI settings' : 'Choose a free model and add its key'}
          </button>
          .
        </p>
      )}
      <div className={styles.chips} data-testid="ask-chips">
        {chips.map((c) => (
          <Chip
            key={c}
            onClick={() => {
              ask(c);
            }}
          >
            {c}
          </Chip>
        ))}
      </div>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          placeholder="Your question about this step…"
          aria-label="Question"
          value={question}
          onChange={(e) => {
            setQuestion(e.target.value);
          }}
        />
        <Button type="submit" variant="primary" disabled={answer?.status === 'busy'}>
          Ask
        </Button>
      </form>
      {waiting ? (
        <PrivacyNotice
          models={waiting.models}
          onAccept={() => {
            grantConsent(waiting.models);
            void run(waiting.q, waiting.fresh);
          }}
          onDecline={() => {
            setWaiting(null);
          }}
        />
      ) : null}
      {answer ? (
        <AskAnswer
          answer={answer}
          onSaveNote={() => {
            appendAnswerToNote(step, answer.q, answer.text);
            setAnswer({ ...answer, noted: true });
            toast("Saved to the step's note");
          }}
          onAddTerm={(term) => {
            useGlossaryStore.getState().add(term, answer.text);
            toast(`"${term}" added to the glossary`);
          }}
          onAskAgain={() => {
            ask(answer.q, true);
          }}
        />
      ) : null}
      <p className={styles.hint}>
        {settings.mode === 'project'
          ? `Sends the step's label, explanation${settings.includePayload ? ', payload' : ''} and layer descriptions`
          : 'Sends only the question'}{' '}
        to {active?.name ?? 'the model you choose'}. Answers under 60 words.
      </p>
    </div>
  );
}
