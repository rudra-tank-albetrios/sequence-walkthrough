import type { Flow } from '@swv/core';
import { Lock, LockOpen, Pause, Play, Puzzle, StepBack, StepForward, Volume2, VolumeX } from 'lucide-react';
import type { ReactNode } from 'react';

import { useVoices } from '../../shared/hooks/useVoices.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { Button } from '../../shared/ui/Button.tsx';
import { Select } from '../../shared/ui/Select.tsx';
import { toast } from '../../shared/ui/toast.ts';
import { Tooltip } from '../../shared/ui/Tooltip.tsx';
import { BehindPopover } from './BehindPopover.tsx';
import { BookmarksPopover } from './BookmarksPopover.tsx';
import { ChaptersNav } from './ChaptersNav.tsx';
import styles from './dock.module.css';
import { FlowRail } from './FlowRail.tsx';
import { PathSelect } from './PathSelect.tsx';

const SPEEDS = [1000, 2000, 3000, 4000, 5000];

/** A hover card for a dock control: what it is, what it does, and its key. */
function Hint({ name, does, keys, children }: { name: string; does: string; keys?: string; children: ReactNode }) {
  return (
    <Tooltip
      side="top"
      content={
        <span className={styles.hint}>
          <b>{name}</b>
          <span>{does}</span>
          {keys ? <kbd>{keys}</kbd> : null}
        </span>
      }
    >
      {children}
    </Tooltip>
  );
}

/** The speaker beside Play. It controls only the voice, and is hidden where there is none. */
function VoiceButton() {
  const muted = useFlowStore((s) => s.settings.voiceMuted);
  const updateSettings = useFlowStore((s) => s.updateSettings);
  if (useVoices().length === 0) return null;
  return (
    <Hint name={muted ? 'Voice is off' : 'Voice is on'} does="Reads each step aloud. The flow keeps playing when it is muted.">
      <Button
        variant="ghost"
        icon
        className={styles.stepper}
        pressed={muted}
        aria-label="Mute the voice"
        data-tour="voice"
        onClick={() => {
          updateSettings({ voiceMuted: !muted });
        }}
      >
        {muted ? <VolumeX size={14} aria-hidden="true" /> : <Volume2 size={14} aria-hidden="true" />}
      </Button>
    </Hint>
  );
}

/** The steppers with a small Play between them, then the voice and the speed. */
function Transport({ flow }: { flow: Flow }) {
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
      <Hint name="Previous step" does="Goes back one step." keys="←">
        <Button
          variant="ghost"
          icon
          className={styles.stepper}
          aria-label="Previous step"
          disabled={cur < 0}
          onClick={() => {
            move(-1);
          }}
        >
          <StepBack size={14} aria-hidden="true" />
        </Button>
      </Hint>
      <Hint
        name={playing ? 'Pause' : 'Play'}
        does={playing ? 'Stops on this step.' : `Walks through the steps by itself, ${String(speed / 1000)} s each.`}
        keys="Space"
      >
        <button
          type="button"
          className={styles.play}
          aria-label={playing ? 'Pause' : 'Play'}
          aria-pressed={playing}
          data-tour="play"
          onClick={() => {
            setPlaying(!playing);
          }}
        >
          {playing ? (
            <Pause size={12} fill="currentColor" aria-hidden="true" />
          ) : (
            <Play size={12} fill="currentColor" aria-hidden="true" />
          )}
        </button>
      </Hint>
      <Hint name="Next step" does="Goes on one step." keys="→">
        <Button
          variant="ghost"
          icon
          className={styles.stepper}
          aria-label="Next step"
          disabled={cur >= flow.steps.length - 1}
          onClick={() => {
            move(1);
          }}
        >
          <StepForward size={14} aria-hidden="true" />
        </Button>
      </Hint>
      <VoiceButton />
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
    </>
  );
}

/** Shows only on a step that has side parts: hover lists them, a click opens their details. */
function SidePartsHere({ flow }: { flow: Flow }) {
  const step = useFlowStore((s) => s.flow?.steps[s.cur]);
  const setUi = useFlowStore((s) => s.setUi);
  if (!step || step.uses.length === 0 || !flow.isSequence) return null;
  const count = step.uses.length;
  return (
    <Tooltip
      side="top"
      content={
        <span className={styles.hint}>
          <b>Side parts on step {step.n}</b>
          {step.uses.map((u) => (
            <span key={`${u.kind}:${u.name}`}>
              {u.kind}: {u.name}
            </span>
          ))}
          <span>Click for the details.</span>
        </span>
      }
    >
      <button
        type="button"
        className={styles.sideHere}
        data-testid="side-here"
        onClick={() => {
          setUi({ sidePartsStep: step.idx });
        }}
      >
        <Puzzle size={13} aria-hidden="true" />
        {count} side part{count === 1 ? '' : 's'}
      </button>
    </Tooltip>
  );
}

/** The place in the flow, the side parts of this step, the tools and the chapter lock. */
function DockEnd({ flow }: { flow: Flow }) {
  const cur = useFlowStore((s) => s.cur);
  const chapterLock = useFlowStore((s) => s.chapterLock);
  const toggleChapterLock = useFlowStore((s) => s.toggleChapterLock);
  return (
    <div className={styles.end}>
      <span className={styles.readout} aria-hidden="true">
        {cur < 0 ? 'Start' : cur + 1} <i>/ {flow.steps.length}</i>
      </span>
      <SidePartsHere flow={flow} />
      <PathSelect flow={flow} />
      <BookmarksPopover flow={flow} />
      <BehindPopover flow={flow} />
      {flow.sections.length > 0 ? (
        <Hint name="Stay in this chapter" does="Next and Previous stop at the chapter's edge." keys="K">
          <Button
            variant="ghost"
            icon
            className={styles.stepper}
            pressed={chapterLock}
            aria-label="Stay inside the current chapter"
            onClick={toggleChapterLock}
          >
            {chapterLock ? <Lock size={14} aria-hidden="true" /> : <LockOpen size={14} aria-hidden="true" />}
          </Button>
        </Hint>
      ) : null}
    </div>
  );
}

/** The bottom bar, flush with the page edge: the transport, the timeline of chapters and steps, then the tools. */
export function Dock({ flow }: { flow: Flow }) {
  return (
    <section id="dock" className={styles.dock} aria-label="Playback" data-tour="dock">
      <div className={styles.inner}>
        <div className={styles.transport}>
          <Transport flow={flow} />
        </div>
        <div className={styles.timeline}>
          <ChaptersNav flow={flow} />
          <FlowRail flow={flow} />
        </div>
        <DockEnd flow={flow} />
      </div>
    </section>
  );
}
