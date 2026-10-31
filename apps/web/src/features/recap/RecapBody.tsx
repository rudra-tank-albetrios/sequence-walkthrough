import { useEffect, useMemo, useState } from 'react';

import { plural } from '../../shared/lib/util.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { flowId } from '../../shared/storage/notes.ts';
import {
  loadWeakPoints,
  requestQuizRetry,
  weakTopics,
  type WeakPoint,
} from '../../shared/storage/weakPoints.ts';
import { Button } from '../../shared/ui/Button.tsx';
import { AnalysisPanel, SampleAnalysis } from './AnalysisPanel.tsx';
import { selectMistakes, type RecapSelection } from './mistakes.ts';
import { MistakeList } from './MistakeList.tsx';
import { PERIODS, type RecapPeriod } from './period.ts';
import styles from './recap.module.css';
import { isDemoFlow, sampleRecap } from './sample.ts';
import { selectionKey } from './savedAnalysis.ts';

/** The quiz accepts at most this many topics. */
const MAX_RETRY_TOPICS = 50;

function useWeakPoints(): readonly WeakPoint[] | null {
  const [points, setPoints] = useState<readonly WeakPoint[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadWeakPoints().then((loaded) => {
      if (!cancelled) setPoints(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return points;
}

function Controls({
  points,
  period,
  setPeriod,
  currentFlow,
  allFlows,
  setAllFlows,
  now,
}: {
  points: readonly WeakPoint[];
  period: RecapPeriod;
  setPeriod: (period: RecapPeriod) => void;
  currentFlow: string | null;
  allFlows: boolean;
  setAllFlows: (allFlows: boolean) => void;
  now: Date;
}) {
  const scope = allFlows ? null : currentFlow;
  return (
    <div className={styles.controls}>
      <div className={styles.seg} role="group" aria-label="Period">
        {PERIODS.map(({ id, label }) => (
          <button key={id} type="button" aria-pressed={period === id} onClick={() => setPeriod(id)}>
            {label} · {selectMistakes(points, { period: id, flowId: scope }, now).length}
          </button>
        ))}
      </div>
      <div className={styles.seg} role="group" aria-label="Flows">
        <button
          type="button"
          aria-pressed={!allFlows}
          disabled={currentFlow === null}
          onClick={() => setAllFlows(false)}
        >
          This flow
        </button>
        <button type="button" aria-pressed={allFlows} onClick={() => setAllFlows(true)}>
          All flows
        </button>
      </div>
    </div>
  );
}

/** Mounted while the recap is open, so each opening reads the latest mistakes. */
export function RecapBody() {
  const flow = useFlowStore((s) => s.flow);
  const code = useFlowStore((s) => s.code);
  const setUi = useFlowStore((s) => s.setUi);
  const own = useWeakPoints();
  const [now] = useState(() => new Date());
  const [period, setPeriod] = useState<RecapPeriod>('today');
  const currentFlow = flow?.isSequence ? flowId(flow) : null;
  const [allFlowsChosen, setAllFlows] = useState(false);
  const allFlows = allFlowsChosen || currentFlow === null;

  // The sample stands in only while the person has no mistakes of their own, on the demo flow.
  const sample = useMemo(
    () =>
      own?.length === 0 && flow?.isSequence && isDemoFlow(code) ? sampleRecap(flow, now) : null,
    [own, flow, code, now],
  );
  const points = sample?.mistakes ?? own;
  const selection: RecapSelection = { period, flowId: allFlows ? null : currentFlow };
  const mistakes = useMemo(
    () => selectMistakes(points ?? [], { period, flowId: selection.flowId }, now),
    [points, period, selection.flowId, now],
  );

  if (!points) return <p className={styles.muted}>Loading your mistakes…</p>;

  const openQuiz = () => setUi({ recapOpen: false, quizOpen: true });
  const retry = () => {
    const topics = weakTopics(mistakes, null, MAX_RETRY_TOPICS);
    requestQuizRetry({ topics, flowId: selection.flowId });
    openQuiz();
  };

  return (
    <div className={styles.recap}>
      <Controls
        points={points}
        period={period}
        setPeriod={setPeriod}
        currentFlow={currentFlow}
        allFlows={allFlows}
        setAllFlows={setAllFlows}
        now={now}
      />
      {sample ? (
        <p className={styles.sample}>
          Sample recap. You have no mistakes saved, so this shows what a recap looks like. Take a
          quiz and your own wrong answers replace it.
        </p>
      ) : null}
      {mistakes.length > 0 ? (
        <>
          <div className={styles.summary}>
            <p className={styles.count}>{plural(mistakes.length, 'mistake')}</p>
            <Button variant="primary" onClick={retry}>
              Retry my mistakes
            </Button>
          </div>
          {sample ? (
            <SampleAnalysis groups={sample.groups} mistakes={mistakes} />
          ) : (
            <AnalysisPanel selection={selectionKey(selection)} mistakes={mistakes} />
          )}
          <h3 className={styles.h3}>Your mistakes</h3>
          <MistakeList mistakes={mistakes} now={now} showFlow={allFlows} />
          <p className={styles.muted}>
            Your mistakes and their analysis stay in this browser. Clearing browser data removes
            them.
          </p>
        </>
      ) : (
        <div className={styles.summary}>
          <p className={styles.muted}>
            {points.length > 0
              ? 'No mistakes here. Pick a longer period or another flow to see earlier ones.'
              : 'No mistakes saved yet. Wrong answers from a quiz appear here.'}
          </p>
          <Button onClick={openQuiz}>Start a quiz</Button>
        </div>
      )}
    </div>
  );
}
