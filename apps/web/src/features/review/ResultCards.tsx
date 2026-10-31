import type { ConfidenceLevel, FlowReview } from '@swv/core';

import styles from './review.module.css';

function verdict(score: number): string {
  if (score >= 90) return 'Follows its layers well.';
  if (score >= 70) return 'Mostly follows its layers.';
  if (score >= 40) return 'Goes around its layers in places.';
  return 'Often goes around its layers.';
}

const scoreBand = (score: number): string => {
  if (score >= 80) return styles.good ?? '';
  return score >= 50 ? (styles.fair ?? '') : (styles.poor ?? '');
};

const CONFIDENCE_LABEL: Readonly<Record<ConfidenceLevel, string>> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

/** The two separate results: the rating of this flow and how much evidence supports it. */
export function ResultCards({ review }: { review: FlowReview }) {
  const { score, confidence, rules } = review;
  const checked = rules.filter((rule) => rule.status !== 'skipped').length;
  return (
    <div className={styles.cards}>
      <section className={styles.card} aria-labelledby="review-rating">
        <h3 id="review-rating" className={styles.cardTitle}>
          Structure rating
        </h3>
        <p className={styles.score} data-testid="review-score">
          {score}
          <span className={styles.outOf}> / 100</span>
        </p>
        <div
          className={`${styles.meter} ${scoreBand(score)}`}
          role="meter"
          aria-label="Structure rating"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={score}
        >
          <span style={{ width: `${score}%` }} />
        </div>
        <p className={styles.line}>{verdict(score)}</p>
        <p className={styles.note}>
          Browser rules give this number, using no tokens, and this flow always gets the same one.
          {` ${checked} of ${rules.length} rules could run on it.`}
        </p>
      </section>
      <section className={styles.card} aria-labelledby="review-confidence">
        <h3 id="review-confidence" className={styles.cardTitle}>
          Confidence
        </h3>
        <p className={styles.level} data-testid="review-confidence">
          {CONFIDENCE_LABEL[confidence.level]}
        </p>
        <p className={styles.note}>How much evidence supports the rating.</p>
        <ul className={styles.reasons}>
          {confidence.reasons.map((reason) => (
            <li key={reason.text}>
              <span aria-hidden="true">{reason.effect === 'up' ? '↑' : '↓'}</span>{' '}
              <span className="sr-only">
                {reason.effect === 'up' ? 'Raises it:' : 'Lowers it:'}
              </span>{' '}
              {reason.text}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
