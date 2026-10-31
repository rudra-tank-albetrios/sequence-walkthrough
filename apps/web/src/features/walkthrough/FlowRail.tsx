import type { Flow, Section, Step } from '@swv/core';
import { memo, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';

import { cx, plural } from '../../shared/lib/util.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { useNotesStore } from '../../shared/state/notesStore.ts';
import { pathVisible, type PathMode } from '../../shared/state/path.ts';
import type { NotesData } from '../../shared/storage/notes.ts';
import styles from './rail.module.css';
import {
  chapterAt,
  chapterJump,
  markerLines,
  nearestShown,
  railMarkers,
  railSections,
  railValueText,
  sharedSideSteps,
  stepAt,
} from './railModel.ts';

/** Pixels between two chapters on the line. The stylesheet positions everything from this number. */
const GAP = 3;
/** Past this many steps the tick marks would only blur together. */
const MOST_TICKS = 120;

const placedAt = (sections: readonly Section[], index: number): CSSProperties =>
  ({ '--i': index, '--j': chapterAt(sections, index) }) as CSSProperties;

/** The line itself: one segment per chapter, filled by the stylesheet from `--cur`, so a step change costs no render. */
const RailTrack = memo(function RailTrack(props: {
  flow: Flow;
  sections: readonly Section[];
  path: PathMode;
  chapter: number;
}) {
  const { flow, sections, path, chapter } = props;
  return (
    <div className={styles.track}>
      {sections.map((sec, j) => (
        <span
          key={sec.idx}
          className={styles.seg}
          data-testid="progress-seg"
          title={`${sec.name}: ${plural(sec.count, 'step')}`}
          {...(j === chapter ? { 'data-current': '' } : {})}
          style={{ '--ch': sec.hue, '--first': sec.firstStep, '--count': sec.count, flexGrow: sec.count } as CSSProperties}
        >
          <span className={styles.fill} />
          {flow.steps.length <= MOST_TICKS ? <span className={styles.ticks} /> : null}
          {flow.steps.slice(sec.firstStep, sec.firstStep + sec.count).map((step) =>
            pathVisible(step, path) ? null : (
              <span
                key={step.idx}
                className={styles.off}
                data-hidden=""
                style={{ '--at': step.idx - sec.firstStep } as CSSProperties}
              />
            ),
          )}
        </span>
      ))}
    </div>
  );
});

/** Errors on the line, threats and bookmarks above it, side parts below it. */
const RailMarkers = memo(function RailMarkers(props: { flow: Flow; sections: readonly Section[]; notes: NotesData }) {
  const { flow, sections, notes } = props;
  return railMarkers(flow, sections, (step) => notes[step.key]?.star ?? false).map((marker) => (
    <span
      key={`${marker.kind}-${String(marker.index)}`}
      className={cx(styles.atStep, styles.marker, styles[marker.kind], marker.beside && styles.beside)}
      data-marker={marker.kind}
      style={{ '--i': marker.index, '--j': marker.chapter } as CSSProperties}
    />
  ));
});

/** Lights up every step that shares a side part with the current one. */
const SharedSideParts = memo(function SharedSideParts(props: {
  flow: Flow;
  sections: readonly Section[];
  step: Step | undefined;
}) {
  const { flow, sections, step } = props;
  return [...sharedSideSteps(flow, step)].map((index) => (
    <span
      key={index}
      className={cx(styles.atStep, styles.marker, styles.shared)}
      data-shared={index}
      style={placedAt(sections, index)}
    />
  ));
});

/** The card above the rail: where a click would land and what is marked there. */
function RailPreview({ flow, sections, step }: { flow: Flow; sections: readonly Section[]; step: Step }) {
  const starred = useNotesStore((s) => s.data[step.key]?.star ?? false);
  const chapter = sections[chapterAt(sections, step.idx)];
  const lines = markerLines(step, starred);
  const route = step.kind === 'self' ? `${step.fromName} to itself` : `${step.fromName} → ${step.toName}`;
  return (
    <div
      className={styles.preview}
      data-testid="rail-preview"
      aria-hidden="true"
      style={{ ...placedAt(sections, step.idx), '--ch': chapter?.hue ?? 210 } as CSSProperties}
    >
      <div className={styles.previewHead}>
        <b>Step {step.n}</b>
        {flow.sections.length > 0 && chapter ? <span>{chapter.name}</span> : null}
      </div>
      <div className={styles.previewRoute}>{route}</div>
      <div className={cx(styles.previewLabel, 'mono')}>{step.label.join(' ')}</div>
      {step.explain ? <p className={styles.previewText}>{step.explain}</p> : null}
      {lines.length > 0 ? (
        <ul className={styles.previewMarks}>
          {lines.map((line) => (
            <li key={`${line.kind} ${line.text}`} data-kind={line.kind}>
              {line.text}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * The signature of the page: the whole flow as one line, split into chapter colours, with its errors,
 * side parts, threats and bookmarks marked on it. Hover previews a step, a click or a drag goes there,
 * and with the keyboard it is a slider. Only custom properties change on a step, so it stays instant.
 */
export function FlowRail({ flow }: { flow: Flow }) {
  const cur = useFlowStore((s) => s.cur);
  const path = useFlowStore((s) => s.path);
  const go = useFlowStore((s) => s.go);
  const notes = useNotesStore((s) => s.data);
  const [hover, setHover] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const scrubbing = useRef(false);

  const sections = useMemo(() => railSections(flow), [flow]);
  const n = flow.steps.length;
  if (n === 0) return null;

  const step = flow.steps[cur];
  const chapter = cur < 0 ? -1 : chapterAt(sections, cur);
  const previewed = flow.steps[hover ?? (focused ? cur : -1)];
  const value = railValueText(flow, sections, cur, step ? (notes[step.key]?.star ?? false) : false);

  const stepUnder = (ev: PointerEvent<HTMLDivElement>): number => {
    const box = ev.currentTarget.getBoundingClientRect();
    const index = stepAt(ev.clientX - box.left, box.width, sections, n, GAP);
    return nearestShown(flow, index, (candidate) => pathVisible(candidate, path));
  };
  const onKeyDown = (ev: KeyboardEvent<HTMLDivElement>) => {
    if (ev.key !== 'PageDown' && ev.key !== 'PageUp') return;
    ev.preventDefault();
    const target = chapterJump(sections, cur, ev.key === 'PageDown' ? 1 : -1);
    if (target !== null) go(target);
  };

  return (
    <div
      className={styles.wrap}
      style={
        {
          '--gap': `${String(GAP)}px`,
          '--k': sections.length,
          '--n': n,
          '--cur': cur,
          '--i': cur < 0 ? -0.5 : cur,
          '--j': Math.max(chapter, 0),
        } as CSSProperties
      }
    >
      <div
        className={styles.rail}
        role="slider"
        tabIndex={0}
        aria-label="Flow Rail"
        aria-valuemin={0}
        aria-valuemax={n}
        aria-valuenow={cur + 1}
        aria-valuetext={value}
        data-testid="progress"
        data-tour="flow-rail"
        onKeyDown={onKeyDown}
        onFocus={(ev) => {
          setFocused(ev.currentTarget.matches(':focus-visible'));
        }}
        onBlur={() => {
          setFocused(false);
        }}
        onPointerDown={(ev) => {
          if (ev.button !== 0) return;
          ev.currentTarget.setPointerCapture(ev.pointerId);
          scrubbing.current = true;
          const index = stepUnder(ev);
          setHover(index);
          go(index);
        }}
        onPointerMove={(ev) => {
          const index = stepUnder(ev);
          setHover(index);
          if (scrubbing.current && index !== useFlowStore.getState().cur) go(index);
        }}
        onPointerUp={(ev) => {
          scrubbing.current = false;
          if (ev.pointerType !== 'mouse') setHover(null);
        }}
        onPointerCancel={() => {
          scrubbing.current = false;
          setHover(null);
        }}
        onPointerLeave={() => {
          if (!scrubbing.current) setHover(null);
        }}
      >
        <RailTrack flow={flow} sections={sections} path={path} chapter={chapter} />
        <RailMarkers flow={flow} sections={sections} notes={notes} />
        <SharedSideParts flow={flow} sections={sections} step={step} />
        {hover !== null && hover !== cur ? (
          <span className={cx(styles.atStep, styles.ghost)} style={placedAt(sections, hover)} />
        ) : null}
        <span className={cx(styles.atStep, styles.cap)} data-testid="rail-cap" />
      </div>
      {previewed ? <RailPreview flow={flow} sections={sections} step={previewed} /> : null}
    </div>
  );
}
