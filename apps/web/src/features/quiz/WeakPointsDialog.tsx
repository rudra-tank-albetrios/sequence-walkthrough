import { useEffect, useState } from 'react';

import { saveFile } from '../../shared/lib/files.ts';
import { fileName, plural } from '../../shared/lib/util.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { flowId } from '../../shared/storage/notes.ts';
import {
  clearWeakPoints,
  loadWeakPoints,
  weakPointsMarkdown,
  type WeakPoint,
} from '../../shared/storage/weakPoints.ts';
import { Button } from '../../shared/ui/Button.tsx';
import { Dialog } from '../../shared/ui/Dialog.tsx';
import { toast } from '../../shared/ui/toast.ts';
import { ChoiceGroup } from './ChoiceGroup.tsx';
import styles from './quiz.module.css';

function WeakPointItem({ point }: { point: WeakPoint }) {
  return (
    <li className={styles.question}>
      <p className={styles.questionText}>{point.question}</p>
      <dl className={styles.facts}>
        <div>
          <dt>Where</dt>
          <dd>
            {point.flow}, step {point.step}
            {point.chapter ? `, ${point.chapter}` : ''}
          </dd>
        </div>
        <div>
          <dt>Topic</dt>
          <dd>{point.topic}</dd>
        </div>
        <div>
          <dt>Your answer</dt>
          <dd>{point.userAnswer.trim() || 'Not answered'}</dd>
        </div>
        <div>
          <dt>Correct answer</dt>
          <dd>{point.correctAnswer}</dd>
        </div>
        <div>
          <dt>Why it was wrong</dt>
          <dd>{point.whyWrong}</dd>
        </div>
        <div>
          <dt>Missed</dt>
          <dd>
            {plural(point.timesMissed, 'time')}, last on {point.date.slice(0, 10)}
          </dd>
        </div>
      </dl>
    </li>
  );
}

function WeakPointsBody() {
  const flow = useFlowStore((s) => s.flow);
  const currentId = flow?.isSequence ? flowId(flow) : null;
  const [points, setPoints] = useState<WeakPoint[] | null>(null);
  const [scope, setScope] = useState<'flow' | 'all'>(currentId ? 'flow' : 'all');
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadWeakPoints().then((loaded) => {
      if (!cancelled) setPoints(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const shown = (points ?? []).filter((point) => scope === 'all' || point.flowId === currentId);

  const clear = async () => {
    await clearWeakPoints(scope === 'all' || currentId === null ? undefined : currentId);
    setPoints(await loadWeakPoints());
    setConfirming(false);
    toast('Weak points cleared');
  };

  const download = async () => {
    const name = scope === 'all' || !flow ? 'Weak points' : `${flow.title} - weak points`;
    await saveFile(fileName(name, 'md'), weakPointsMarkdown(shown), 'text/markdown');
  };

  return (
    <div className={styles.weakBody}>
      <p className={styles.note}>
        Weak points are kept only in this browser. Clearing your browser data removes them too. A
        correct answer later lowers the count, and at zero the point goes away.
      </p>
      {currentId ? (
        <ChoiceGroup
          legend="Show"
          name="weak-scope"
          value={scope}
          options={[
            { value: 'flow', label: 'This flow' },
            { value: 'all', label: 'All flows' },
          ]}
          onChange={(next) => {
            setScope(next);
            setConfirming(false);
          }}
        />
      ) : null}
      {points === null ? (
        <p className={styles.note} role="status">
          Loading…
        </p>
      ) : shown.length === 0 ? (
        <p className={styles.note}>Nothing here yet. Mistakes in a quiz show up in this list.</p>
      ) : (
        <>
          <ul className={styles.questions}>
            {shown.map((point) => (
              <WeakPointItem key={point.id} point={point} />
            ))}
          </ul>
          {confirming ? (
            <div className={styles.markingFailed} role="alert">
              <p className={styles.errorText}>
                Clear {plural(shown.length, 'weak point')}? This cannot be undone.
              </p>
              <Button onClick={() => setConfirming(false)}>Keep them</Button>
              <Button variant="primary" onClick={() => void clear()}>
                Clear for good
              </Button>
            </div>
          ) : (
            <div className={styles.setupActions}>
              <Button onClick={() => setConfirming(true)}>Clear</Button>
              <Button variant="primary" onClick={() => void download()}>
                Export as Markdown
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** The weak points list: view, export, clear. Opens through `ui.weakPointsOpen`. */
export function WeakPointsDialog() {
  const open = useFlowStore((s) => s.ui.weakPointsOpen);
  const setUi = useFlowStore((s) => s.setUi);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setUi({ weakPointsOpen: false });
      }}
      title="Weak points"
      description="What you got wrong in quizzes, kept in this browser."
      size="wide"
    >
      {open ? <WeakPointsBody /> : null}
    </Dialog>
  );
}
