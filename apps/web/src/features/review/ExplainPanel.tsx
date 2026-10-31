import type { ReviewFinding } from '@swv/core';
import { useEffect, useRef, useState } from 'react';

import { useFlowStore } from '../../shared/state/flowStore.ts';
import { Button } from '../../shared/ui/Button.tsx';
import { EXPLAIN_MAX, explainFindings, type Explanation } from './explain.ts';
import styles from './review.module.css';

/** These need the settings dialog before anything can be asked. */
const NEEDS_SETTINGS = new Set(['no-model', 'consent-needed']);

/**
 * The user's model puts the findings in plain words. Its reply is shown as plain text in its own
 * block, and nothing it says can reach the rating, the findings or an action.
 */
export function ExplainPanel({ findings }: { findings: readonly ReviewFinding[] }) {
  const setUi = useFlowStore((s) => s.setUi);
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<Explanation | null>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => request.current?.abort(), []);

  const ask = async (fresh: boolean) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setAsking(true);
    const result = await explainFindings(findings, { fresh, signal: controller.signal });
    if (controller.signal.aborted) return;
    setAsking(false);
    if (!result.ok && result.kind === 'aborted') return;
    setAnswer(result);
    if (!result.ok && NEEDS_SETTINGS.has(result.kind)) setUi({ aiSettingsOpen: true });
  };

  return (
    <section aria-labelledby="review-explain" data-testid="review-explain">
      <h3 id="review-explain" className={styles.h3}>
        In plain words
      </h3>
      <p className={styles.note}>
        Your own model can explain these findings. It cannot change the rating or the findings.
        {findings.length > EXPLAIN_MAX
          ? ` It explains the ${EXPLAIN_MAX} most serious of ${findings.length}.`
          : ''}
      </p>
      {answer?.ok ? (
        <>
          <ol className={styles.points}>
            {answer.points.map(({ finding, plain }, i) => (
              <li key={i}>
                <span className={styles.pointAbout}>{finding.message}</span>
                <span data-testid="review-point">{plain}</span>
              </li>
            ))}
          </ol>
          <p className={styles.note}>
            {answer.cached
              ? `Saved answer from ${answer.by}, no tokens used.`
              : `From ${answer.by}.`}
          </p>
        </>
      ) : null}
      {answer?.notices.map((notice) => (
        <p key={notice} className={styles.note}>
          {notice}
        </p>
      ))}
      <p role="status" className={styles.note} data-testid="review-explain-status">
        {asking ? 'Asking your model…' : answer && !answer.ok ? answer.message : ''}
      </p>
      <Button
        disabled={asking}
        onClick={() => {
          void ask(answer?.ok === true);
        }}
      >
        {answer?.ok ? 'Ask again' : 'Explain in plain words'}
      </Button>
    </section>
  );
}
