import { useEffect } from 'react';

import { AiSettingsDialog, AskDialog } from '../features/ask-ai/index.ts';
import { CodePanel } from '../features/code-panel/index.ts';
import { ImportDialog, useDropImport } from '../features/export/index.ts';
import { FindPopover } from '../features/find/index.ts';
import { GuideDialog, ShortcutsDialog } from '../features/guide/index.ts';
import { InsightPanel } from '../features/insight/index.ts';
import { ReviewHost } from '../features/review/index.ts';
import { TableView } from '../features/table/index.ts';
import { Viewer } from '../features/viewer/index.ts';
import { PresenterCard, SelectionMenu, WalkBar, WalkthroughRuntime } from '../features/walkthrough/index.ts';
import { useIsNarrow } from '../shared/hooks/useMediaQuery.ts';
import { debounce } from '../shared/lib/util.ts';
import { useFlowStore } from '../shared/state/flowStore.ts';
import { useGlossaryStore } from '../shared/state/glossaryStore.ts';
import { useNotesStore } from '../shared/state/notesStore.ts';
import { flowId } from '../shared/storage/notes.ts';
import { saveCode } from '../shared/storage/settings.ts';
import { Button } from '../shared/ui/Button.tsx';
import { Kbd } from '../shared/ui/Kbd.tsx';
import { ToastHost } from '../shared/ui/Toast.tsx';
import { toast } from '../shared/ui/toast.ts';
import { TooltipProvider } from '../shared/ui/Tooltip.tsx';
import styles from './App.module.css';
import { useDocumentTitle } from './title.ts';
import { TopBar } from './TopBar.tsx';
import { loadInitialCode } from './boot.ts';
import { useGlobalKeys } from './useGlobalKeys.ts';
import { useHideMode } from './useHideMode.ts';

function EdgeTab({
  side,
  expanded,
  label,
  onClick,
}: {
  side: 'top' | 'bottom' | 'left';
  expanded: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.edge} ${styles[side]}`}
      aria-expanded={expanded}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <svg viewBox="0 0 10 6" aria-hidden="true">
        <path d="M1 5 5 1 9 5" />
      </svg>
    </button>
  );
}

export function App() {
  const narrow = useIsNarrow();
  const flow = useFlowStore((s) => s.flow);
  const ui = useFlowStore((s) => s.ui);
  const setUi = useFlowStore((s) => s.setUi);
  const settings = useFlowStore((s) => s.settings);
  const updateSettings = useFlowStore((s) => s.updateSettings);
  const setCode = useFlowStore((s) => s.setCode);
  const go = useFlowStore((s) => s.go);
  const loadNotes = useNotesStore((s) => s.load);
  const loadGlossary = useGlossaryStore((s) => s.load);

  useGlobalKeys(narrow);
  useDropImport();
  useDocumentTitle(flow);
  useHideMode();

  // First load: the link, then the autosaved code, then the demo flow.
  useEffect(() => {
    let cancelled = false;
    void loadInitialCode(window.location.hash).then(({ code, step, message }) => {
      if (cancelled) return;
      setCode(code);
      if (step !== null) go(step);
      if (message) toast(message);
    });
    return () => {
      cancelled = true;
    };
  }, [setCode, go]);

  // Autosave the code a moment after each change, as version 2 did.
  useEffect(() => {
    const save = debounce((code: string) => {
      saveCode(code);
    }, 400);
    let last = useFlowStore.getState().code;
    const unsubscribe = useFlowStore.subscribe((s) => {
      if (s.code !== last) {
        last = s.code;
        if (s.code.trim()) save(s.code);
      }
    });
    return () => {
      unsubscribe();
      save.cancel();
    };
  }, []);

  useEffect(() => {
    loadNotes(flow);
    if (flow?.isSequence) loadGlossary(flowId(flow));
  }, [flow, loadNotes, loadGlossary]);

  const hidden = ui.controlsHidden;
  const topFolded = Boolean(settings.fold?.top);
  const barFolded = Boolean(settings.fold?.bar);
  const showTop = !hidden && !topFolded;
  const showBar = !hidden && !barFolded;
  const codeShown = ui.codeOpen && !hidden;

  return (
    <TooltipProvider>
      <div className={styles.app} data-hidden={hidden || undefined}>
        {showTop ? <TopBar /> : <div />}
        <main
          className={styles.stage}
          id="stage"
          data-code-open={codeShown || undefined}
          data-insight-open={ui.insightOpen || undefined}
        >
          <Viewer />
          {hidden ? null : <FindPopover />}
          <PresenterCard />
          <InsightPanel />
          {hidden && !ui.presenter ? (
            <Button
              className={styles.showControls}
              onClick={() => setUi({ controlsHidden: false, presenter: false })}
            >
              Show controls · <Kbd>Esc</Kbd>
            </Button>
          ) : null}
          {!hidden ? (
            <>
              <EdgeTab
                side="top"
                expanded={!topFolded}
                label={topFolded ? 'Show the header' : 'Hide the header'}
                onClick={() => updateSettings({ fold: { ...settings.fold, top: !topFolded } })}
              />
              <EdgeTab
                side="bottom"
                expanded={!barFolded}
                label={barFolded ? 'Show the step bar' : 'Hide the step bar'}
                onClick={() => updateSettings({ fold: { ...settings.fold, bar: !barFolded } })}
              />
              {ui.codeOpen ? (
                <EdgeTab side="left" expanded label="Hide the code" onClick={() => setUi({ codeOpen: false })} />
              ) : null}
            </>
          ) : null}
          {hidden ? null : <CodePanel />}
          <TableView />
        </main>
        {showBar ? <WalkBar /> : <div />}
        <WalkthroughRuntime />
        <SelectionMenu />
        <AskDialog />
        <AiSettingsDialog />
        <GuideDialog />
        <ShortcutsDialog />
        <ImportDialog />
        <ReviewHost />
        <ToastHost />
      </div>
    </TooltipProvider>
  );
}

