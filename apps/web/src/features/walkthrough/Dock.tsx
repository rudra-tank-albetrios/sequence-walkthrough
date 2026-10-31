import type { Flow } from '@swv/core';
import { Lock, LockOpen, Pause, Play, StepBack, StepForward } from 'lucide-react';
import type { ReactNode } from 'react';

import { useFlowStore } from '../../shared/state/flowStore.ts';
import { Button } from '../../shared/ui/Button.tsx';
import { Select } from '../../shared/ui/Select.tsx';
import { toast } from '../../shared/ui/toast.ts';
import { BehindPopover } from './BehindPopover.tsx';
import { BookmarksPopover } from './BookmarksPopover.tsx';
import { ChaptersNav } from './ChaptersNav.tsx';
import styles from './dock.module.css';
import { FlowRail } from './FlowRail.tsx';
import { PathSelect } from './PathSelect.tsx';

const SPEEDS = [1000, 2000, 3000, 4000, 5000];

/** Play, the steppers and the speed, in the middle of the dock, with room for the voice control. */
function Transport({ flow, besidePlay }: { flow: Flow; besidePlay: ReactNode }) {
  const cur = useFlowStore((s) => s.cur);
  const playing = useFlowStore((s) => s.playing);
  const speed = useFlowStore((s) => s.settings.speed);
  const next = useFlowStore((s) => s.next);
  const prev = useFlowStore((s) => s.prev);
  const setPlaying = useFlowStore((s) => s.setPlaying);
  const updateSettings = useFlowStore((s) => s.updateSettings);
  const move = (direction: 1 | -1) => {
    const message = direction === 1 ? next() : prev();
    if (message) toast(message);
  };
  return (
    <>
      <Select
        className={styles.speed}
        aria-label="Seconds per step"
        title="Seconds per step"
        data-tour="speed"
        value={speed}
        onChange={(ev) => {
          updateSettings({ speed: Number(ev.target.value) });
        }}
      >
        {SPEEDS.map((ms) => (
          <option key={ms} value={ms}>
            {ms / 1000} s
          </option>
        ))}
      </Select>
      <Button
        variant="ghost"
        icon
        className={styles.stepper}
        aria-label="Previous step"
        title="Previous step (Left arrow)"
        disabled={cur < 0}
        onClick={() => {
          move(-1);
        }}
      >
        <StepBack size={18} aria-hidden="true" />
      </Button>
      <button
        type="button"
        className={styles.play}
        aria-label={playing ? 'Pause' : 'Play'}
        aria-pressed={playing}
        title="Play / pause (Space)"
        data-tour="play"
        onClick={() => {
          setPlaying(!playing);
        }}
      >
        {playing ? (
          <Pause size={22} fill="currentColor" aria-hidden="true" />
        ) : (
          <Play size={22} fill="currentColor" aria-hidden="true" />
        )}
      </button>
      <Button
        variant="ghost"
        icon
        className={styles.stepper}
        aria-label="Next step"
        title="Next step (Right arrow)"
        disabled={cur >= flow.steps.length - 1}
        onClick={() => {
          move(1);
        }}
      >
        <StepForward size={18} aria-hidden="true" />
      </Button>
      <div className={styles.besidePlay} data-tour="voice">
        {besidePlay}
      </div>
    </>
  );
}

/** The chapter lock and the place in the flow as a plain readout. */
function DockEnd({ flow }: { flow: Flow }) {
  const cur = useFlowStore((s) => s.cur);
  const chapterLock = useFlowStore((s) => s.chapterLock);
  const toggleChapterLock = useFlowStore((s) => s.toggleChapterLock);
  return (
    <div className={styles.end}>
      <span className={styles.readout} aria-hidden="true">
        {cur < 0 ? 'Start' : cur + 1} <i>/ {flow.steps.length}</i>
      </span>
      {flow.sections.length > 0 ? (
        <Button
          variant="ghost"
          icon
          pressed={chapterLock}
          aria-label="Stay inside the current chapter"
          title="Stay inside the current chapter (K)"
          onClick={toggleChapterLock}
        >
          {chapterLock ? <Lock size={16} aria-hidden="true" /> : <LockOpen size={16} aria-hidden="true" />}
        </Button>
      ) : null}
    </div>
  );
}

/** The floating dock: chapters, the Flow Rail, and the transport with Play at its centre. */
export function Dock({ flow, besidePlay }: { flow: Flow; besidePlay?: ReactNode }) {
  return (
    <section id="dock" className={styles.dock} aria-label="Playback" data-tour="dock">
      <ChaptersNav flow={flow} />
      <FlowRail flow={flow} />
      <div className={styles.controls}>
        <div className={styles.tools}>
          <PathSelect flow={flow} />
          <BookmarksPopover flow={flow} />
          <BehindPopover flow={flow} />
        </div>
        <div className={styles.transport}>
          <Transport flow={flow} besidePlay={besidePlay} />
        </div>
        <DockEnd flow={flow} />
      </div>
    </section>
  );
}
