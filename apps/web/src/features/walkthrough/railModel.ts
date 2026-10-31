import type { Flow, Section, Step } from '@swv/core';

import { plural } from '../../shared/lib/util.ts';

/** What the Flow Rail marks on a step. */
export type RailMarkerKind = 'error' | 'side' | 'threat' | 'star';

export interface RailMarker {
  kind: RailMarkerKind;
  index: number;
  /** Position of the step's chapter on the rail, which sets how many gaps come before it. */
  chapter: number;
  /** A star on a step that also has a threat moves aside so both stay visible. */
  beside: boolean;
}

export interface RailThreat {
  level?: string;
  text?: string;
}

/** Threats arrive with `%% @threat` from the review phase; until then a step has none. */
export const threatsOf = (step: Step): readonly RailThreat[] =>
  (step as Step & { threats?: readonly RailThreat[] }).threats ?? [];

/** The chapters drawn on the rail. A flow without chapters is one long chapter. */
export function railSections(flow: Flow): Section[] {
  const n = flow.steps.length;
  const named = flow.sections.filter((s) => s.count > 0);
  if (named.length > 0) return named;
  return [{ name: flow.title, firstStep: 0, count: n, hue: 210, idx: 0, line: -1, summary: '' }];
}

/** Which rail chapter a step falls in; the overview counts as the first one. */
export function chapterAt(sections: readonly Section[], index: number): number {
  for (let j = sections.length - 1; j > 0; j--) {
    const sec = sections[j];
    if (sec && index >= sec.firstStep) return j;
  }
  return 0;
}

/** Width of one step when `gap` pixels separate the chapters. */
const unitOf = (width: number, sections: readonly Section[], n: number, gap: number): number =>
  Math.max(width - gap * (sections.length - 1), 0) / Math.max(n, 1);

/** The step under a pointer `x` pixels from the rail's left edge. */
export function stepAt(x: number, width: number, sections: readonly Section[], n: number, gap: number): number {
  const unit = unitOf(width, sections, n, gap);
  if (unit <= 0) return 0;
  let chapter = 0;
  for (const [j, sec] of sections.entries()) {
    chapter = j;
    if (x < unit * (sec.firstStep + sec.count) + gap * j + gap / 2) break;
  }
  const sec = sections[chapter];
  if (!sec) return 0;
  const inside = Math.floor((x - unit * sec.firstStep - gap * chapter) / unit);
  return sec.firstStep + Math.min(Math.max(inside, 0), sec.count - 1);
}

/** The centre of a step, in pixels from the rail's left edge. */
export function stepCentre(index: number, width: number, sections: readonly Section[], n: number, gap: number): number {
  return unitOf(width, sections, n, gap) * (index + 0.5) + gap * chapterAt(sections, index);
}

/** Every marker on the rail: errors, side parts, threats and bookmarks. */
export function railMarkers(
  flow: Flow,
  sections: readonly Section[],
  starred: (step: Step) => boolean,
): RailMarker[] {
  const markers: RailMarker[] = [];
  for (const step of flow.steps) {
    const chapter = chapterAt(sections, step.idx);
    const add = (kind: RailMarkerKind, beside = false) => {
      markers.push({ kind, index: step.idx, chapter, beside });
    };
    if (step.isError) add('error');
    if (step.uses.length > 0) add('side');
    const threatened = threatsOf(step).length > 0;
    if (threatened) add('threat');
    if (starred(step)) add('star', threatened);
  }
  return markers;
}

/** The steps that share a side part with this one, the step itself included. */
export function sharedSideSteps(flow: Flow, step: Step | undefined): Set<number> {
  const shared = new Set<number>();
  if (!step) return shared;
  for (const used of step.uses) {
    for (const part of flow.uses) {
      if (part.kind === used.kind && part.name === used.name) {
        for (const i of part.steps) shared.add(i);
      }
    }
  }
  return shared;
}

/** The plain lines the preview and screen readers give for a step's markers. */
export function markerLines(step: Step, isStarred: boolean): { kind: RailMarkerKind; text: string }[] {
  const lines: { kind: RailMarkerKind; text: string }[] = [];
  if (step.isError) {
    const status = step.status ? `Error ${String(step.status.code)}` : 'Error';
    const reason = step.status?.reason ? `: ${step.status.reason}` : '';
    lines.push({ kind: 'error', text: `${status}${reason}` });
  }
  for (const part of step.uses) lines.push({ kind: 'side', text: `${part.kind} ${part.name}` });
  for (const threat of threatsOf(step)) {
    lines.push({ kind: 'threat', text: `Threat${threat.level ? ` (${threat.level})` : ''}: ${threat.text ?? ''}`.trim() });
  }
  if (isStarred) lines.push({ kind: 'star', text: 'Bookmarked' });
  return lines;
}

/** What a screen reader hears for the rail's value. */
export function railValueText(flow: Flow, sections: readonly Section[], cur: number, isStarred: boolean): string {
  const n = flow.steps.length;
  const step = flow.steps[cur];
  if (!step) return `Overview, ${plural(n, 'step')}`;
  const chapter = flow.sections.length > 0 ? `, ${sections[chapterAt(sections, cur)]?.name ?? ''}` : '';
  const marks = markerLines(step, isStarred).map((line) => line.text);
  return [`Step ${String(step.n)} of ${String(n)}${chapter}`, step.label.join(' '), ...marks].join('. ');
}

/** The closest step the path filter shows, so a click never lands on a step the filter hides. */
export function nearestShown(flow: Flow, index: number, shown: (step: Step) => boolean): number {
  for (let distance = 0; distance < flow.steps.length; distance++) {
    for (const i of [index + distance, index - distance]) {
      const step = flow.steps[i];
      if (step && shown(step)) return i;
    }
  }
  return index;
}

/** Page Down and Page Up on the rail: the next chapter, or the start of this one first. */
export function chapterJump(sections: readonly Section[], cur: number, direction: 1 | -1): number | null {
  if (cur < 0) return direction === 1 ? (sections[0]?.firstStep ?? null) : null;
  const chapter = chapterAt(sections, cur);
  const here = sections[chapter];
  if (direction === -1 && here && cur !== here.firstStep) return here.firstStep;
  return sections[chapter + direction]?.firstStep ?? null;
}
