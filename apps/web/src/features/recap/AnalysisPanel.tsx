import { useId, type ReactNode } from 'react';

import type { WeakPoint } from '../../shared/storage/weakPoints.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { Button } from '../../shared/ui/Button.tsx';
import { Chip } from '../../shared/ui/Chip.tsx';
import type { AnalysisGroup } from './analysis.ts';
import { recapModel } from './recapModel.ts';
import { liveGroups, type SavedAnalysis } from './savedAnalysis.ts';
import styles from './recap.module.css';
import { useAnalysis, type AnalysisView } from './useAnalysis.ts';

const DAY = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

function Panel({ live = false, children }: { live?: boolean; children: ReactNode }) {
  const headingId = useId();
  return (
    <section
      className={styles.panel}
      aria-labelledby={headingId}
      {...(live ? { 'aria-live': 'polite' as const } : {})}
    >
      <h3 id={headingId} className={styles.h3}>
        Key points
      </h3>
      {children}
    </section>
  );
}

/** The themes. Everything here is shown as plain text, whatever a model's reply held. */
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
      {liveGroups(groups, mistakes).map((group, index) => {
        const numbers = group.mistakeIds.map(numberOf).filter((number) => number > 0);
        return (
          <section key={index} data-testid="recap-group">
            <h4 className={styles.groupTitle}>{group.title}</h4>
            <ul className={styles.points}>
              {group.points.map((point, pointIndex) => (
                <li key={pointIndex}>{point}</li>
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

/** The part of the panel that needs a model: the invitation, or an error and a second try. */
function AskForAnalysis({
  view,
  analyse,
}: {
  view: Extract<AnalysisView, { status: 'none' | 'error' }>;
  analyse: () => void;
}) {
  const setUi = useFlowStore((s) => s.setUi);
  // Rendering again when the settings dialog closes picks up a key added there.
  useFlowStore((s) => s.ui.aiSettingsOpen);
  const model = recapModel();
  if (!model) {
    return (
      <p className={styles.muted}>
        No model is set up, so there is no analysis. Your mistakes and the correct answers are all
        below.{' '}
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
        <p className={styles.notice}>You have new mistakes since the last analysis.</p>
      ) : null}
      <Button variant="primary" onClick={analyse}>
        {view.status === 'error' ? 'Try again' : 'Analyse my mistakes'}
      </Button>
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
    <Panel live>
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
    </Panel>
  );
}

export interface SampleAnalysisProps {
  groups: readonly AnalysisGroup[];
  mistakes: readonly WeakPoint[];
}

/** The built-in key points of the sample recap. No model wrote them and nothing is sent. */
export function SampleAnalysis({ groups, mistakes }: SampleAnalysisProps) {
  return (
    <Panel>
      <Groups groups={groups} mistakes={mistakes} />
      <p className={styles.savedLine}>
        <Chip>Sample</Chip>
        <span>Built in. Your own model writes these for your own mistakes.</span>
      </p>
    </Panel>
  );
}
