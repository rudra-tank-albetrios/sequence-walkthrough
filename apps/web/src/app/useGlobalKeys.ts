import { useEffect } from 'react';

import { useDiagramStore } from '../shared/state/diagramStore.ts';
import { useFlowStore } from '../shared/state/flowStore.ts';
import { useNotesStore } from '../shared/state/notesStore.ts';
import { toast } from '../shared/ui/toast.ts';
import { escapeCascade } from './escape.ts';

const FIELD = 'input, textarea, select, [contenteditable]';

/** Steps the chapter: the first step of the previous or next chapter from the current step. */
function chapterStep(direction: 1 | -1): number | null {
  const { flow, cur } = useFlowStore.getState();
  if (!flow?.isSequence || flow.sections.length === 0) return null;
  const current = flow.steps[cur]?.section ?? -1;
  const target = flow.sections[current + direction];
  const first = flow.sections[current]?.firstStep;
  if (direction === -1 && cur >= 0 && first !== undefined && cur !== first) return first;
  return target ? target.firstStep : null;
}

/** The keyboard map of the page (docs/v2-internals.md section 3). */
export function useGlobalKeys(narrow: boolean): void {
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.defaultPrevented || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (useFlowStore.getState().ui.tourOpen) return;
      const target = ev.target as HTMLElement | null;
      const inField = Boolean(target?.closest(FIELD));
      if (ev.key === 'Escape') {
        if (target?.tagName === 'SELECT') return;
        if (document.querySelector('[role="dialog"], [role="menu"]')) return;
        escapeCascade(narrow);
        return;
      }
      if (inField) return;
      if (target?.tagName === 'BUTTON' && (ev.key === ' ' || ev.key === 'Enter')) return;
      const s = useFlowStore.getState();
      const commands = useDiagramStore.getState().commands;
      const steps = s.flow?.isSequence ? s.flow.steps.length : 0;
      const handled = (() => {
        switch (ev.key) {
          case 'ArrowRight': {
            const message = s.next();
            if (message) toast(message);
            return true;
          }
          case 'ArrowLeft': {
            const message = s.prev();
            if (message) toast(message);
            return true;
          }
          case 'Home':
            if (steps) s.go(0);
            return true;
          case 'End':
            if (steps) s.go(steps - 1);
            return true;
          case '[': {
            const i = chapterStep(-1);
            if (i !== null) s.go(i);
            return true;
          }
          case ']': {
            const i = chapterStep(1);
            if (i !== null) s.go(i);
            return true;
          }
          case ' ':
            if (steps) s.setPlaying(!s.playing);
            return true;
          case 'ArrowUp':
          case 'ArrowDown':
            if (s.view !== 'diagram' || target?.closest('[data-table-scroll]')) return false;
            commands.panBy(0, ev.key === 'ArrowUp' ? 80 : -80);
            return true;
          case '+':
          case '=':
            commands.zoomIn();
            return true;
          case '-':
          case '_':
            commands.zoomOut();
            return true;
          case '0':
            commands.fitWidth();
            return true;
          default:
            return letter(ev.key.toLowerCase(), s, steps);
        }
      })();
      if (handled) ev.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [narrow]);
}

function letter(key: string, s: ReturnType<typeof useFlowStore.getState>, steps: number): boolean {
  const commands = useDiagramStore.getState().commands;
  switch (key) {
    case 'f':
      commands.fitAll();
      return true;
    case 'k':
      s.toggleChapterLock();
      toast(s.chapterLock ? 'Arrow keys unlocked' : 'Arrow keys stay inside this chapter');
      return true;
    case 't':
      s.setView(s.view === 'diagram' ? 'table' : 'diagram');
      return true;
    case 'i':
      s.setUi({ insightOpen: !s.ui.insightOpen });
      return true;
    case 'a':
      if (steps && s.cur >= 0) s.setUi({ askOpen: true });
      return true;
    case 'h':
      s.setUi({ controlsHidden: !s.ui.controlsHidden, presenter: false });
      return true;
    case 'p':
      s.setUi({ presenter: !s.ui.presenter, controlsHidden: !s.ui.presenter });
      return true;
    case 'c':
      s.setUi({ codeOpen: !s.ui.codeOpen });
      return true;
    case 'b': {
      const step = s.flow?.steps[s.cur];
      if (step) {
        const starred = useNotesStore.getState().toggleStar(step);
        toast(starred ? `Step ${step.n} bookmarked` : `Bookmark removed from step ${step.n}`);
      }
      return true;
    }
    case 'n':
      if (steps && s.cur >= 0) s.setUi({ noteOpen: !s.ui.noteOpen });
      return true;
    case '/':
      s.setUi({ findOpen: true });
      return true;
    case '?':
      s.setUi({ shortcutsOpen: true });
      return true;
    default:
      return false;
  }
}
