import type { WeakPoint } from '../../shared/storage/weakPoints.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { Button } from '../../shared/ui/Button.tsx';
import { Chip } from '../../shared/ui/Chip.tsx';
import type { AnalysisGroup } from './analysis.ts';
import { recapModel } from './recapModel.ts';
import { liveGroups, type SavedAnalysis } from './savedAnalysis.ts';
import styles from './recap.module.css';
import { useAnalysis } from './useAnalysis.ts';

const DAY = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** The model's themes. Everything here is plain text, whatever the reply held. */
function Groups({
  groups,
  mistakes,
}: {
  groups: readonly AnalysisGroup[];
  mistakes: readonly WeakPoint[];
}) {
  const numberOf = (id: string) => mistakes.findIndex((mistake) => mistake.id === id) + 1;
  return (
    <div className={styles.groups}>
      {liveGroups(groups, mistakes).map((group) => {
        const numbers = group.mistakeIds.map(numberOf).filter((number) => number > 0);
        return (
          <section key={group.title} data-testid="recap-group">
            <h4 className={styles.groupTitle}>{group.title}</h4>
            <ul className={styles.points}>
              {group.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            {numbers.length > 0 ? (
              <p className={styles.covers}>
                {numbers.length === 1 ? 'Mistake' : 'Mistakes'} {numbers.join(', ')}
              </p>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function SavedLine({ saved }: { saved: SavedAnalysis }) {
  const known = Object.keys(saved.seen).length;
  return (
    <p className={styles.savedLine}>
      <Chip title="Kept in this browser. Showing it again sends nothing">Saved analysis</Chip>
      <span>
        {saved.model}, {DAY.format(new Date(saved.savedAt))}. It stays until new mistakes appear.
        {saved.sent < known ? ` It covers the ${saved.sent} most missed of ${known}.` : ''}
      </span>
    </p>
  );
}

/** The part of the panel that needs a model: an invitation, the request, or its error. */
function AskForAnalysis({
  view,
  analyse,
}: {
  view: { status: 'none'; stale: boolean } | { status: 'error'; message: string };
  analyse: () => void;
}) {
  // Re-read after the settings dialog closes, so a new key takes effect at once.
  const setUi = useFlowStore((s) => s.setUi);
  useFlowStore((s) => s.ui.aiSettingsOpen);
  const model = recapModel();
  if (!model) {
    return (
      <p className={styles.muted}>
        No model is set up, so there is no analysis. The mistakes and correct answers are all here.{' '}
        <button
          type="button"
          className={styles.link}
          onClick={() => setUi({ aiSettingsOpen: true })}
        >
          Add a model
        </button>{' '}
        to get short key points.
      </p>
    );
  }
  return (
    <>
      {view.status === 'error' ? <p className={styles.error}>{view.message}</p> : null}
      {view.status === 'none' && view.stale ? (
        <p className={styles.muted}>You have new mistakes since the last analysis.</p>
      ) : null}
      <div className={styles.panelActions}>
        <Button variant="primary" onClick={analyse}>
          {view.status === 'error' ? 'Try again' : 'Analyse my mistakes'}
        </Button>
      </div>
      <p className={styles.savedLine}>
        Sends these questions, your answers and the correct answers to {model.name}. The reply is at
        most about 500 tokens and stays in this browser until new mistakes appear.
      </p>
    </>
  );
}

export interface AnalysisPanelProps {
  selection: string;
  mistakes: readonly WeakPoint[];
}

/** Key points for the person's own mistakes, from their own model. */
export function AnalysisPanel({ selection, mistakes }: AnalysisPanelProps) {
  const { view, analyse } = useAnalysis(selection, mistakes);
  return (
    <section className={styles.panel} aria-label="Key points" aria-live="polite">
      <h3 className={styles.h3}>Key points</h3>
      {view.status === 'loading' ? <p className={styles.muted}>Loading…</p> : null}
      {view.status === 'busy' ? <p className={styles.muted}>Analysing your mistakes…</p> : null}
      {view.status === 'none' || view.status === 'error' ? (
        <AskForAnalysis view={view} analyse={analyse} />
      ) : null}
      {view.status === 'saved' ? (
        <>
          <Groups groups={view.saved.groups} mistakes={mistakes} />
          <SavedLine saved={view.saved} />
        </>
      ) : null}
    </section>
  );
}

export interface SampleAnalysisProps {
  groups: readonly AnalysisGroup[];
  mistakes: readonly WeakPoint[];
}

/** The built-in key points of the sample recap. No model wrote them and nothing is sent. */
export function SampleAnalysis({ groups, mistakes }: SampleAnalysisProps) {
  return (
    <section className={styles.panel} aria-label="Key points">
      <h3 className={styles.h3}>Key points</h3>
      <Groups groups={groups} mistakes={mistakes} />
      <p className={styles.savedLine}>
        <Chip>Sample</Chip>
        <span>Built in. Your own model writes these for your own mistakes.</span>
      </p>
    </section>
  );
}
