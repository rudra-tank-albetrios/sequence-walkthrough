import { copyText } from '../../shared/lib/util.ts';
import { Button } from '../../shared/ui/Button.tsx';
import { Chip } from '../../shared/ui/Chip.tsx';
import { Kbd } from '../../shared/ui/Kbd.tsx';
import { toast } from '../../shared/ui/toast.ts';
import styles from './ask.module.css';

/** One question and what came back. The text is always rendered as plain text, never as markup. */
export interface Answer {
  q: string;
  /** The word a `What is …?` question asked about; gives the answer an `Add to glossary` button. */
  term: string | null;
  status: 'busy' | 'done' | 'error';
  text: string;
  cached: boolean;
  providerName: string;
  model: string;
  /** The answer was appended to the step's note already. */
  noted: boolean;
}

export interface AskAnswerProps {
  answer: Answer;
  onSaveNote: () => void;
  onAddTerm: (term: string) => void;
  onAskAgain: () => void;
}

export function AskAnswer({ answer, onSaveNote, onAddTerm, onAskAgain }: AskAnswerProps) {
  const done = answer.status === 'done';
  return (
    <div
      className={`${styles.answer} ${answer.status === 'error' ? styles.err : ''}`}
      aria-live="polite"
      data-testid="ask-answer"
    >
      <div className={styles.q}>{answer.q}</div>
      <div className={styles.a}>{answer.status === 'busy' ? 'Thinking…' : answer.text}</div>
      {done ? (
        <div className={styles.meta}>
          <span>
            {answer.providerName} · {answer.model}
          </span>
          {answer.cached ? <Chip title="This answer was given before and kept in this browser">Saved answer</Chip> : null}
        </div>
      ) : null}
      {done ? (
        <div className={styles.act}>
          {answer.term ? (
            <Button
              onClick={() => {
                if (answer.term) onAddTerm(answer.term);
              }}
            >
              Add to glossary
            </Button>
          ) : null}
          {answer.noted ? (
            <span className={styles.hint}>
              Saved to this step&apos;s note (edit with <Kbd>N</Kbd>).
            </span>
          ) : (
            <Button onClick={onSaveNote}>Save to note</Button>
          )}
          <Button
            onClick={() => {
              void copyText(answer.text).then((ok) => {
                toast(ok ? 'Copied the answer' : 'Could not copy; select the text instead');
              });
            }}
          >
            Copy
          </Button>
          <Button onClick={onAskAgain} title="Send the question again, without the saved answer">
            Ask again
          </Button>
        </div>
      ) : null}
    </div>
  );
}
