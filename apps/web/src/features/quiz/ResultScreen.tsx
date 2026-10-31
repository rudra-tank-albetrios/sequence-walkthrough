import type { Flow } from '@swv/core';

import { useFlowStore } from '../../shared/state/flowStore.ts';
import { route } from '../../shared/storage/notes.ts';
import { Button } from '../../shared/ui/Button.tsx';
import { Chip, type ChipTone } from '../../shared/ui/Chip.tsx';
import { timeLine } from './clock.ts';
import { DownloadsPanel } from './DownloadsPanel.tsx';
import { markerLabel, scoreLine, scoreQuiz, scoreRowText, weakFound, type ScoreRow } from './marking.ts';
import { useQuizStore } from './quizStore.ts';
import { MARK_LABELS, TYPE_LABELS, type MarkValue, type Question } from './types.ts';
import styles from './quiz.module.css';

const MARK_TONES: Record<MarkValue, ChipTone> = {
  correct: 'ok',
  partly: 'unconfirmed',
  wrong: 'error',
};

function ScoreTable({ caption, head, rows }: { caption: string; head: string; rows: ScoreRow[] }) {
  return (
    <table className={styles.scores}>
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{head}</th>
          <th scope="col">Score</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th scope="row">{row.label}</th>
            <td>{scoreRowText(row)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ResultItem({ question, flow, index }: { question: Question; flow: Flow; index: number }) {
  const answer = useQuizStore((s) => s.answers[question.id] ?? '');
  const mark = useQuizStore((s) => s.marks[question.id]);
  const marking = useQuizStore((s) => s.marking);
  const markAsCorrect = useQuizStore((s) => s.markAsCorrect);
  const go = useFlowStore((s) => s.go);
  const setUi = useFlowStore((s) => s.setUi);
  const step = flow.steps[question.stepIndex];
  const marker = mark ? markerLabel(question, mark) : null;
  const canOverride = question.type !== 'choice' && mark?.value !== 'correct';
  return (
    <li className={styles.question}>
      <p className={styles.questionText}>
        {index + 1}. {question.text}
      </p>
      <div className={styles.meta}>
        {mark ? (
          <Chip tone={MARK_TONES[mark.value]}>{MARK_LABELS[mark.value]}</Chip>
        ) : (
          <Chip tone="unconfirmed">{marking === 'busy' ? 'AI marking…' : 'Not marked'}</Chip>
        )}
        {marker ? <Chip tone="marker">{marker}</Chip> : null}
        <Chip>{TYPE_LABELS[question.type]}</Chip>
        <Chip>{question.topic}</Chip>
      </div>
      <dl className={styles.facts}>
        <div>
          <dt>Your answer</dt>
          <dd>{answer.trim() || 'Not answered'}</dd>
        </div>
        <div>
          <dt>Correct answer</dt>
          <dd>{question.answer}</dd>
        </div>
        <div>
          <dt>Reason</dt>
          <dd>{question.why}</dd>
        </div>
        {mark?.by === 'ai' && mark.feedback ? (
          <div>
            <dt>Feedback</dt>
            <dd>{mark.feedback}</dd>
          </div>
        ) : null}
      </dl>
      <div className={styles.itemActions}>
        {step ? (
          <Button
            variant="ghost"
            onClick={() => {
              go(step.idx);
              setUi({ quizOpen: false });
            }}
          >
            Go to step {step.n}: {route(step)}
          </Button>
        ) : null}
        {canOverride ? (
          <Button onClick={() => markAsCorrect(question.id)}>
            Mark as correct<span className="sr-only"> question {index + 1}</span>
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function WeakPointsFound({ questions }: { questions: Question[] }) {
  const marks = useQuizStore((s) => s.marks);
  const setUi = useFlowStore((s) => s.setUi);
  const found = weakFound(questions, marks);
  return (
    <section className={styles.section} aria-labelledby="quiz-weak">
      <h3 id="quiz-weak" className={styles.heading}>
        Weak points found
      </h3>
      {found.length === 0 ? (
        <p className={styles.note}>None so far.</p>
      ) : (
        <ul className={styles.weakFound}>
          {found.map(({ topic, count }) => (
            <li key={topic}>
              <Chip tone="unconfirmed">
                {topic}: {count}
              </Chip>
            </li>
          ))}
        </ul>
      )}
      <Button onClick={() => setUi({ weakPointsOpen: true })}>See all weak points</Button>
    </section>
  );
}

/** Score, time, the scores per chapter and level, every question, weak points and downloads. */
export function ResultScreen({ flow }: { flow: Flow }) {
  const questions = useQuizStore((s) => s.questions);
  const marks = useQuizStore((s) => s.marks);
  const time = useQuizStore((s) => s.config.time);
  const startedAt = useQuizStore((s) => s.startedAt);
  const finishedAt = useQuizStore((s) => s.finishedAt);
  const autoSubmitted = useQuizStore((s) => s.autoSubmitted);
  const marking = useQuizStore((s) => s.marking);
  const problem = useQuizStore((s) => s.markingProblem);
  const retryMarking = useQuizStore((s) => s.retryMarking);
  const backToSetup = useQuizStore((s) => s.backToSetup);
  const score = scoreQuiz(flow, questions, marks);
  return (
    <div className={styles.result}>
      <section className={styles.summary} aria-labelledby="quiz-score">
        <h3 id="quiz-score" className={styles.score}>
          {scoreLine(score)}
        </h3>
        <p className={styles.note}>{timeLine(time, startedAt, finishedAt, autoSubmitted)}</p>
        {marking === 'busy' ? (
          <p className={styles.note} role="status">
            AI marking your written answers…
          </p>
        ) : null}
        {marking === 'failed' ? (
          <div className={styles.markingFailed} role="alert">
            <p className={styles.errorText}>{problem}</p>
            <Button onClick={retryMarking}>Try marking again</Button>
          </div>
        ) : null}
      </section>
      <div className={styles.scoreTables}>
        <ScoreTable caption="Score per chapter" head="Chapter" rows={score.chapters} />
        <ScoreTable caption="Score per difficulty" head="Difficulty" rows={score.levels} />
      </div>
      <WeakPointsFound questions={questions} />
      <section className={styles.section} aria-labelledby="quiz-answers">
        <h3 id="quiz-answers" className={styles.heading}>
          Answers
        </h3>
        <ol className={styles.questions}>
          {questions.map((question, index) => (
            <ResultItem key={question.id} question={question} flow={flow} index={index} />
          ))}
        </ol>
      </section>
      <DownloadsPanel finished />
      <div className={styles.setupActions}>
        <Button variant="primary" onClick={backToSetup}>
          New quiz
        </Button>
      </div>
    </div>
  );
}
