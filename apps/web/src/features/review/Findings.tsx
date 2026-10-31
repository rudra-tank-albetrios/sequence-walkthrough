import {
  REVIEW_AREA_LABEL,
  type ReviewArea,
  type ReviewFinding,
  type ReviewRuleResult,
} from '@swv/core';

import { Chip } from '../../shared/ui/Chip.tsx';
import styles from './review.module.css';
import { StepButton } from './StepButton.tsx';

const AREAS = Object.keys(REVIEW_AREA_LABEL) as ReviewArea[];

const SEVERITY_TONE = { high: 'error', medium: 'unconfirmed', low: 'neutral' } as const;

/** What the rules found, by area, each with the steps it is about. */
export function Findings({ findings }: { findings: readonly ReviewFinding[] }) {
  if (findings.length === 0) {
    return (
      <p className={styles.muted} data-testid="review-findings">
        The rules found nothing in this flow.
      </p>
    );
  }
  return (
    <div data-testid="review-findings">
      <h3 className={styles.h3}>What the rules found</h3>
      {AREAS.map((area) => {
        const inArea = findings.filter((finding) => finding.area === area);
        if (inArea.length === 0) return null;
        return (
          <section key={area} aria-label={REVIEW_AREA_LABEL[area]}>
            <h4 className={styles.h4}>{REVIEW_AREA_LABEL[area]}</h4>
            <ul className={styles.list}>
              {inArea.map((finding, i) => (
                <li key={i} className={styles.finding}>
                  <Chip tone={SEVERITY_TONE[finding.severity]}>{finding.severity}</Chip>
                  <span className={styles.message}>{finding.message}</span>
                  <span className={styles.steps}>
                    {finding.steps.map((step) => (
                      <StepButton key={step} index={step} />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

const STATUS_MARK = { passed: '✓', found: '!', skipped: '–' } as const;
const STATUS_TEXT = { passed: 'Passed', found: 'Found', skipped: 'Not checked' } as const;

/** Every rule the review runs and what happened to it, so the rating can be checked by hand. */
export function RulesList({ rules }: { rules: readonly ReviewRuleResult[] }) {
  return (
    <section aria-labelledby="review-rules" data-testid="review-rules">
      <h3 id="review-rules" className={styles.h3}>
        The rules
      </h3>
      <ul className={styles.rules}>
        {rules.map((rule) => (
          <li key={rule.id} data-status={rule.status}>
            <span className={styles.mark} aria-hidden="true">
              {STATUS_MARK[rule.status]}
            </span>
            <span>
              <span className="sr-only">{STATUS_TEXT[rule.status]}: </span>
              <span className={styles.ruleArea}>{REVIEW_AREA_LABEL[rule.area]}:</span> {rule.title}
              {rule.detail ? <span className={styles.ruleDetail}> {rule.detail}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
