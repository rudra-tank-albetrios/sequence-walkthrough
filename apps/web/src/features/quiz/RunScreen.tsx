import type { Flow } from '@swv/core';
import { useEffect, useState } from 'react';

import { plural } from '../../shared/lib/util.ts';
import { route } from '../../shared/storage/notes.ts';
import { Button } from '../../shared/ui/Button.tsx';
import { Chip } from '../../shared/ui/Chip.tsx';
import { clockView, formatClock } from './clock.ts';
import { DownloadsPanel } from './DownloadsPanel.tsx';
import { useQuizStore } from './quizStore.ts';
import { LEVELS, TYPE_LABELS, type Question } from './types.ts';
import styles from './quiz.module.css';

const ONE_LINE_MAX = 300;
const THEORY_MAX = 1000;

/** The time at each tick. The clock reads the wall clock, so a slow tick only shows late. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** Counts up or down, warns near the end of a timer and submits at zero. */
function QuizClock() {
  const time = useQuizStore((s) => s.config.time);
  const startedAt = useQuizStore((s) => s.startedAt);
  const submit = useQuizStore((s) => s.submit);
  const now = useNow();
  const view = clockView(time, startedAt, now);

  useEffect(() => {
    if (view.expired) submit(true);
  }, [view.expired, submit]);

  if (view.remainingMs === null) {
    return (
      <div className={styles.clock} role="timer" aria-label="Time taken">
        Time taken <strong>{formatClock(view.elapsedMs)}</strong>
      </div>
    );
  }
  return (
    <div className={`${styles.clock} ${view.warning ? styles.clockWarning : ''}`}>
      <span role="timer" aria-label="Time left">
        Time left <strong>{formatClock(view.remainingMs, true)}</strong>
      </span>
      {/* Announced once, when the text first appears. */}
      <span role="status">{view.warning ? 'Almost out of time. It submits at zero.' : ''}</span>
    </div>
  );
}

function QuestionMeta({ question, flow }: { question: Question; flow: Flow }) {
  const step = flow.steps[question.stepIndex];
  return (
    <div className={styles.meta}>
      <Chip tone="follow">
        Step {step?.n}
        {step ? `: ${route(step)}` : ''}
      </Chip>
      <Chip>{TYPE_LABELS[question.type]}</Chip>
      <Chip>{LEVELS[question.difficulty].label}</Chip>
    </div>
  );
}

function ChoiceAnswer({ question, label }: { question: Question; label: string }) {
  const value = useQuizStore((s) => s.answers[question.id] ?? '');
  const answer = useQuizStore((s) => s.answer);
  return (
    <fieldset className={styles.options}>
      <legend className={styles.questionText}>{label}</legend>
      {question.options.map((option) => (
        <label key={option} className={styles.option}>
          <input
            type="radio"
            name={`answer-${question.id}`}
            checked={value === option}
            onChange={() => answer(question.id, option)}
          />
          <span>{option}</span>
        </label>
      ))}
    </fieldset>
  );
}

function WrittenAnswer({ question, label }: { question: Question; label: string }) {
  const value = useQuizStore((s) => s.answers[question.id] ?? '');
  const answer = useQuizStore((s) => s.answer);
  const id = `answer-${question.id}`;
  return (
    <>
      <label className={styles.questionText} htmlFor={id}>
        {label}
      </label>
      {question.type === 'line' ? (
        <input
          id={id}
          type="text"
          className={styles.field}
          maxLength={ONE_LINE_MAX}
          autoComplete="off"
          value={value}
          placeholder="A few words"
          onChange={(ev) => answer(question.id, ev.target.value)}
        />
      ) : (
        <textarea
          id={id}
          className={styles.field}
          rows={3}
          maxLength={THEORY_MAX}
          value={value}
          placeholder="One or two short sentences"
          onChange={(ev) => answer(question.id, ev.target.value)}
        />
      )}
    </>
  );
}

/** The questions, the clock, and the option to download the quiz. */
export function RunScreen({ flow }: { flow: Flow }) {
  const questions = useQuizStore((s) => s.questions);
  return (
    <div className={styles.run}>
      <QuizClock />
      <ol className={styles.questions}>
        {questions.map((question, i) => {
          const label = `${i + 1}. ${question.text}`;
          return (
            <li key={question.id} className={styles.question}>
              {question.type === 'choice' ? (
                <ChoiceAnswer question={question} label={label} />
              ) : (
                <WrittenAnswer question={question} label={label} />
              )}
              <QuestionMeta question={question} flow={flow} />
            </li>
          );
        })}
      </ol>
      <DownloadsPanel finished={false} />
    </div>
  );
}

/** How far along the user is, and Submit. Ends the quiz, once. */
export function SubmitBar() {
  const total = useQuizStore((s) => s.questions.length);
  const answered = useQuizStore(
    (s) => s.questions.filter((question) => (s.answers[question.id] ?? '').trim() !== '').length,
  );
  const submit = useQuizStore((s) => s.submit);
  const left = total - answered;
  return (
    <div className={styles.submitBar}>
      <span className={styles.note}>{left > 0 ? `${plural(left, 'question')} not answered` : 'All answered'}</span>
      <Button variant="primary" onClick={() => submit()}>
        Submit
      </Button>
    </div>
  );
}
