import { useEffect, useState } from 'react';

import { useFlowStore } from '../../shared/state/flowStore.ts';
import { Button } from '../../shared/ui/Button.tsx';
import { Dialog } from '../../shared/ui/Dialog.tsx';
import { useQuizStore } from './quizStore.ts';
import { ResultScreen } from './ResultScreen.tsx';
import { RunScreen, SubmitBar } from './RunScreen.tsx';
import { SetupScreen } from './SetupScreen.tsx';
import { WeakPointsDialog } from './WeakPointsDialog.tsx';
import styles from './quiz.module.css';

/** A running quiz asks before it is thrown away (plan section 8.6). */
function LeaveDialog({ open, onStay }: { open: boolean; onStay: () => void }) {
  const leave = useQuizStore((s) => s.leave);
  const setUi = useFlowStore((s) => s.setUi);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onStay();
      }}
      title="Leave this quiz?"
      description="Your answers are lost if you leave now."
      showDescription
      size="narrow"
      actions={
        <>
          <Button
            onClick={() => {
              onStay();
              leave();
              setUi({ quizOpen: false });
            }}
          >
            Leave the quiz
          </Button>
          <Button variant="primary" onClick={onStay} autoFocus>
            Keep going
          </Button>
        </>
      }
    >
      <p className={styles.note}>The clock keeps running while you decide.</p>
    </Dialog>
  );
}

function QuizBody() {
  const phase = useQuizStore((s) => s.phase);
  const error = useQuizStore((s) => s.error);
  const quizFlow = useQuizStore((s) => s.flow);
  const leave = useQuizStore((s) => s.leave);
  const backToSetup = useQuizStore((s) => s.backToSetup);
  const flow = useFlowStore((s) => s.flow);

  if (phase === 'loading') {
    return (
      <div className={styles.waiting}>
        <p role="status">Writing your quiz. This takes a few seconds.</p>
        <Button onClick={leave}>Cancel</Button>
      </div>
    );
  }
  if (phase === 'error') {
    return (
      <div className={styles.waiting}>
        <p role="alert" className={styles.errorText}>
          {error}
        </p>
        <Button variant="primary" onClick={backToSetup}>
          Back to the set-up
        </Button>
      </div>
    );
  }
  if (phase === 'running' && quizFlow) return <RunScreen flow={quizFlow} />;
  if (phase === 'result' && quizFlow) return <ResultScreen flow={quizFlow} />;
  if (!flow?.isSequence) {
    return <p className={styles.note}>The quiz works with sequence diagrams.</p>;
  }
  return <SetupScreen flow={flow} />;
}

function QuizDialog() {
  const open = useFlowStore((s) => s.ui.quizOpen);
  const setUi = useFlowStore((s) => s.setUi);
  const phase = useQuizStore((s) => s.phase);
  const prepare = useQuizStore((s) => s.prepare);
  const leave = useQuizStore((s) => s.leave);
  const [askingToLeave, setAskingToLeave] = useState(false);

  useEffect(() => {
    if (open) prepare();
  }, [open, prepare]);

  const onOpenChange = (next: boolean) => {
    if (next) return;
    if (phase === 'running') {
      setAskingToLeave(true);
      return;
    }
    if (phase === 'loading') leave();
    setUi({ quizOpen: false });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Quiz"
      description="Questions that come only from the flow on screen, each linked to its step."
      size="wide"
      {...(phase === 'running' ? { actions: <SubmitBar /> } : {})}
    >
      <QuizBody />
      <LeaveDialog
        open={askingToLeave && phase === 'running'}
        onStay={() => setAskingToLeave(false)}
      />
    </Dialog>
  );
}

/** The chunk `QuizMount` loads when the quiz or the weak points list is first opened. */
export default function QuizScreens() {
  return (
    <>
      <QuizDialog />
      <WeakPointsDialog />
    </>
  );
}
