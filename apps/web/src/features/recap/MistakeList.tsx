import type { WeakPoint } from '../../shared/storage/weakPoints.ts';
import { Chip } from '../../shared/ui/Chip.tsx';
import styles from './recap.module.css';

const TIME = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const DAY = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

function When({ date, now }: { date: string; now: Date }) {
  const time = new Date(date);
  const today = time.toDateString() === now.toDateString();
  return (
    <time dateTime={date}>
      Last missed {today ? `today, ${TIME.format(time)}` : `on ${DAY.format(time)}`}
    </time>
  );
}

function Mistake({ point, now, showFlow }: { point: WeakPoint; now: Date; showFlow: boolean }) {
  return (
    <li className={styles.mistake} data-testid="recap-mistake">
      <div className={styles.meta}>
        {showFlow ? <span>{point.flow}</span> : null}
        {point.chapter ? <Chip>{point.chapter}</Chip> : null}
        <Chip tone="follow">{point.topic}</Chip>
        <span>Step {point.step}</span>
        <span>{point.timesMissed === 1 ? 'Missed once' : `Missed ${point.timesMissed} times`}</span>
        <When date={point.date} now={now} />
      </div>
      <p className={styles.question}>{point.question}</p>
      <dl className={styles.facts}>
        <dt>Your answer</dt>
        <dd className={styles.wrong}>{point.userAnswer || 'Not answered'}</dd>
        {point.whyWrong ? (
          <>
            <dt>Why it was wrong</dt>
            <dd>{point.whyWrong}</dd>
          </>
        ) : null}
        <dt>Correct answer</dt>
        <dd className={styles.right}>{point.correctAnswer}</dd>
      </dl>
    </li>
  );
}

interface MistakeListProps {
  mistakes: readonly WeakPoint[];
  now: Date;
  /** Names each mistake's flow, when the list covers all flows. */
  showFlow: boolean;
}

/** Every mistake in full: the question, the answer given, why it was wrong and the right answer. */
export function MistakeList({ mistakes, now, showFlow }: MistakeListProps) {
  return (
    <ol className={styles.list} aria-label="Your mistakes">
      {mistakes.map((point) => (
        <Mistake key={point.id} point={point} now={now} showFlow={showFlow} />
      ))}
    </ol>
  );
}
