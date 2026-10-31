import { useState } from 'react';

import { Button } from '../../shared/ui/Button.tsx';
import { toast } from '../../shared/ui/toast.ts';
import { saveQuizFile, type QuizFile, type QuizFormat } from './exports/download.ts';
import styles from './quiz.module.css';

interface RowProps {
  name: string;
  detail: string;
  formats: readonly QuizFormat[];
  disabled: boolean;
  onSave: (format: QuizFormat) => void;
}

const FORMAT_LABELS: Record<QuizFormat, string> = { md: 'Markdown', pdf: 'PDF' };

function DownloadRow({ name, detail, formats, disabled, onSave }: RowProps) {
  return (
    <div className={styles.downloadRow}>
      <span className={styles.downloadName}>
        {name}
        <small>{detail}</small>
      </span>
      {formats.map((format) => (
        <Button
          key={format}
          disabled={disabled}
          aria-label={`${name} as ${FORMAT_LABELS[format]}`}
          onClick={() => onSave(format)}
        >
          {FORMAT_LABELS[format]}
        </Button>
      ))}
    </div>
  );
}

/** The downloads: the quiz, and once it is submitted the result, each also with the flow. */
export function DownloadsPanel({ finished }: { finished: boolean }) {
  const [withAnswers, setWithAnswers] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = (file: QuizFile, format: QuizFormat) => {
    setBusy(true);
    saveQuizFile(file, format, withAnswers)
      .catch(() => {
        toast('The file could not be made. Try again.');
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <details className={styles.downloads}>
      <summary>Downloads</summary>
      <div className={styles.downloadRows}>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={withAnswers}
            onChange={(ev) => setWithAnswers(ev.target.checked)}
          />
          Include the answers in the quiz
        </label>
        <DownloadRow
          name="Quiz"
          detail={withAnswers ? 'Questions with answers and reasons' : 'Questions without answers'}
          formats={['md', 'pdf']}
          disabled={busy}
          onSave={(format) => save('quiz', format)}
        />
        {finished ? (
          <DownloadRow
            name="Result"
            detail="Questions, your answers, score, time and feedback"
            formats={['md', 'pdf']}
            disabled={busy}
            onSave={(format) => save('result', format)}
          />
        ) : null}
        <DownloadRow
          name="Quiz with flow"
          detail={`${finished ? 'The result' : 'The quiz'} plus the diagram image and Mermaid code`}
          formats={['pdf', 'md']}
          disabled={busy}
          onSave={(format) => save('flow', format)}
        />
        <p className={styles.note} role="status">
          {busy ? 'Making the file…' : ''}
        </p>
      </div>
    </details>
  );
}
