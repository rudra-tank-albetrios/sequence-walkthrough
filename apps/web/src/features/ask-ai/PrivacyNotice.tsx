import { modelHost, type ModelEntry } from '@swv/ai';

import { Button } from '../../shared/ui/Button.tsx';
import styles from './settings.module.css';

export interface PrivacyNoticeProps {
  /** Every model that could receive the text: the first model and the marked fallbacks. */
  models: readonly ModelEntry[];
  onAccept: () => void;
  /** Leaves the notice open for later. Without it, only the accept button shows. */
  onDecline?: () => void;
}

/** Plan section 4: before the first AI feature, say what text goes to which provider. */
export function PrivacyNotice({ models, onAccept, onDecline }: PrivacyNoticeProps) {
  return (
    <section className={styles.notice} aria-label="What is sent to the model" data-testid="privacy-notice">
      <h3 className={styles.noticeTitle}>Before anything is sent</h3>
      <p>The AI features send text from this page to the model you chose, using your own key:</p>
      <ul>
        <li>
          <strong>Ask AI, in this project:</strong> your question, and the step&apos;s label, explanation, payload
          (unless you turned it off), layer descriptions and matching glossary lines.
        </li>
        <li>
          <strong>Ask AI, in general:</strong> only your question.
        </li>
        <li>
          <strong>Quiz and recap:</strong> a short summary of the flow and your answers, never the full diagram code.
        </li>
      </ul>
      <p>It goes to:</p>
      <ul>
        {models.map((model) => (
          <li key={model.id}>
            {model.name} ({modelHost(model)}){model.fallback ? ', when a model before it is out' : ''}
          </li>
        ))}
      </ul>
      <p>
        That provider&apos;s own terms apply. Auto-switch uses only the models you marked as fallbacks. Your key is
        stored in this browser, not encrypted, and goes only to its own model&apos;s address.
      </p>
      <div className={styles.noticeActions}>
        {onDecline ? <Button onClick={onDecline}>Not now</Button> : null}
        <Button variant="primary" onClick={onAccept}>
          I understand, continue
        </Button>
      </div>
    </section>
  );
}
