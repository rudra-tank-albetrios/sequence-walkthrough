import type { Flow } from '@swv/core';
import { useMemo, useState, type FormEvent } from 'react';

import { useFlowStore } from '../../shared/state/flowStore.ts';
import { flowId } from '../../shared/storage/notes.ts';
import { Button } from '../../shared/ui/Button.tsx';
import { ChoiceGroup } from './ChoiceGroup.tsx';
import { CUSTOM_MINUTES, validMinutes } from './clock.ts';
import { hasUsableModel } from './model.ts';
import { useQuizStore } from './quizStore.ts';
import { pickSample, sampleQuestions } from './sample/index.ts';
import {
  DIFFICULTIES,
  LEVELS,
  QUESTION_COUNTS,
  QUESTION_TYPES,
  TIMER_MINUTES,
  TYPE_LABELS,
  type DifficultyChoice,
  type QuestionCount,
  type QuizConfig,
  type QuizSource,
  type TimeMode,
  type TypeChoice,
} from './types.ts';
import styles from './quiz.module.css';

const LEVEL_OPTIONS: { value: DifficultyChoice; label: string }[] = [
  ...DIFFICULTIES.map((value) => ({ value, label: LEVELS[value].label })),
  { value: 'all', label: 'All levels' },
];

const TYPE_OPTIONS: { value: TypeChoice; label: string }[] = [
  ...QUESTION_TYPES.map((value) => ({ value, label: TYPE_LABELS[value] })),
  { value: 'mix', label: 'Mix' },
];

const COUNT_OPTIONS = QUESTION_COUNTS.map((value) => ({ value, label: String(value) }));

const TIME_OPTIONS: { value: TimeMode['kind']; label: string }[] = [
  { value: 'stopwatch', label: 'Stopwatch' },
  { value: 'timer', label: 'Timer' },
  { value: 'off', label: 'Off' },
];

type TimerChoice = (typeof TIMER_MINUTES)[number] | 'custom';

const TIMER_OPTIONS: { value: TimerChoice; label: string }[] = [
  ...TIMER_MINUTES.map((value) => ({ value, label: `${value} minutes` })),
  { value: 'custom', label: 'Custom' },
];

function levelHint(level: DifficultyChoice): string {
  const levels = level === 'all' ? DIFFICULTIES : [level];
  return levels.map((one) => `${LEVELS[one].label}: ${LEVELS[one].topics.join(', ')}`).join('. ');
}

/** Where the questions come from, and what that sends where. */
function SourceNote({
  source,
  hasSample,
  ready,
  pick,
  onPick,
}: {
  source: QuizSource | null;
  hasSample: boolean;
  ready: boolean;
  pick: QuizSource;
  onPick: (source: QuizSource) => void;
}) {
  const setUi = useFlowStore((s) => s.setUi);
  const openSettings = () => setUi({ aiSettingsOpen: true });
  return (
    <div className={styles.source}>
      {ready && hasSample ? (
        <ChoiceGroup
          legend="Questions from"
          name="quiz-source"
          value={pick}
          options={[
            { value: 'model', label: 'Your model' },
            { value: 'sample', label: 'The built-in sample' },
          ]}
          onChange={onPick}
        />
      ) : null}
      {source === 'model' ? (
        <p className={styles.note}>
          Your model gets a short summary of this flow (never the diagram code), the questions you
          were asked lately and your weak topics. Written answers go to it for marking, in one batch.
          Nothing goes anywhere else.
        </p>
      ) : null}
      {source === 'sample' && !ready ? (
        <p className={styles.note}>
          This is the demo flow, so a built-in sample quiz works with no model and no key. For fresh
          questions on any flow,{' '}
          <button type="button" className={styles.link} onClick={openSettings}>
            set up a model in AI settings
          </button>
          .
        </p>
      ) : null}
      {source === 'sample' && ready ? (
        <p className={styles.note}>The built-in sample uses no tokens and sends nothing.</p>
      ) : null}
      {source === null ? (
        <p className={styles.note}>
          The questions on this flow come from your model, and none is set up yet. The built-in
          sample only covers the demo flow.
        </p>
      ) : null}
    </div>
  );
}

/** Difficulty, number of questions, types and time, then Start. */
export function SetupScreen({ flow }: { flow: Flow }) {
  const saved = useQuizStore((s) => s.config);
  const retry = useQuizStore((s) => s.retry);
  const notice = useQuizStore((s) => s.notice);
  const start = useQuizStore((s) => s.start);
  const dropRetry = useQuizStore((s) => s.dropRetry);
  const setUi = useFlowStore((s) => s.setUi);
  // Read again when the AI settings dialog closes: a model may have been added there.
  useFlowStore((s) => s.ui.aiSettingsOpen);

  const [difficulty, setDifficulty] = useState<DifficultyChoice>(saved.difficulty);
  const [count, setCount] = useState<QuestionCount>(saved.count);
  const [type, setType] = useState<TypeChoice>(saved.type);
  const [timeKind, setTimeKind] = useState<TimeMode['kind']>(saved.time.kind);
  const [timerChoice, setTimerChoice] = useState<TimerChoice>(5);
  const [customMinutes, setCustomMinutes] = useState('20');
  const [pick, setPick] = useState<QuizSource>('model');

  const ready = hasUsableModel();
  const hasSample = sampleQuestions(flow).length > 0;
  const source: QuizSource | null = ready ? (hasSample ? pick : 'model') : hasSample ? 'sample' : null;

  const minutes = timerChoice === 'custom' ? validMinutes(customMinutes) : timerChoice;
  const timeValid = timeKind !== 'timer' || minutes !== null;
  const time: TimeMode = timeKind === 'timer' ? { kind: 'timer', minutes: minutes ?? 5 } : { kind: timeKind };
  const focus = useMemo(() => retry?.topics ?? [], [retry]);
  const focused = focus.length > 0;
  const config: QuizConfig = { difficulty: focused ? 'all' : difficulty, count, type, time, focus };

  const sampleSize =
    source === 'sample' ? pickSample(flow, config, { weak: [], recent: [] }).length : count;
  const canStart = timeValid && sampleSize > 0;

  const onSubmit = (ev: FormEvent) => {
    ev.preventDefault();
    if (source === null) {
      setUi({ aiSettingsOpen: true });
      return;
    }
    if (canStart) void start(config, source);
  };

  return (
    <form className={styles.setup} onSubmit={onSubmit}>
      {focused ? (
        <div className={styles.retry} role="status">
          <p>
            Practising your mistakes: <strong>{focus.join(', ')}</strong>.
            {retry?.flowId && retry.flowId !== flowId(flow)
              ? ' They came from another flow, and the questions still come only from this one.'
              : ''}
          </p>
          <Button onClick={dropRetry}>Ask all topics instead</Button>
        </div>
      ) : (
        <div>
          <ChoiceGroup
            legend="Difficulty"
            name="quiz-level"
            value={difficulty}
            options={LEVEL_OPTIONS}
            onChange={setDifficulty}
          />
          <p className={styles.hint}>{levelHint(difficulty)}</p>
        </div>
      )}
      <ChoiceGroup
        legend="Questions"
        name="quiz-count"
        value={count}
        options={COUNT_OPTIONS}
        onChange={setCount}
      />
      <ChoiceGroup
        legend="Question types"
        name="quiz-type"
        value={type}
        options={TYPE_OPTIONS}
        onChange={setType}
      />
      <div>
        <ChoiceGroup
          legend="Time"
          name="quiz-time"
          value={timeKind}
          options={TIME_OPTIONS}
          onChange={setTimeKind}
        />
        {timeKind === 'timer' ? (
          <div className={styles.timerRow}>
            <ChoiceGroup
              legend="Timer length"
              name="quiz-timer"
              value={timerChoice}
              options={TIMER_OPTIONS}
              onChange={setTimerChoice}
            />
            {timerChoice === 'custom' ? (
              <label className={styles.minutes}>
                Minutes
                <input
                  type="number"
                  min={CUSTOM_MINUTES.min}
                  max={CUSTOM_MINUTES.max}
                  step={1}
                  value={customMinutes}
                  onChange={(ev) => setCustomMinutes(ev.target.value)}
                  aria-invalid={minutes === null}
                />
              </label>
            ) : null}
            {minutes === null ? (
              <p className={styles.errorText} role="alert">
                Enter whole minutes from {CUSTOM_MINUTES.min} to {CUSTOM_MINUTES.max}.
              </p>
            ) : (
              <p className={styles.hint}>It warns near the end and submits at zero.</p>
            )}
          </div>
        ) : null}
      </div>
      <SourceNote source={source} hasSample={hasSample} ready={ready} pick={pick} onPick={setPick} />
      {source === 'sample' && sampleSize < count ? (
        <p className={sampleSize > 0 ? styles.note : styles.errorText} role="status">
          {sampleSize > 0
            ? `The built-in sample has ${sampleSize} such questions, so this quiz has ${sampleSize}.`
            : 'The built-in sample has no questions on these topics.'}
        </p>
      ) : null}
      {notice ? (
        <p className={styles.note} role="status">
          {notice}
        </p>
      ) : null}
      <div className={styles.setupActions}>
        <Button onClick={() => setUi({ weakPointsOpen: true })}>Weak points</Button>
        <Button type="submit" variant="primary" disabled={!canStart}>
          {source === null ? 'Open AI settings' : 'Start the quiz'}
        </Button>
      </div>
    </form>
  );
}
