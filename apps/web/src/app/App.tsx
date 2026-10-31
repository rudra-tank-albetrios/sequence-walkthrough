import { lazy, useEffect, useRef } from 'react';

import { ImportDialog, useDropImport } from '../features/export/index.ts';
import { FindPopover } from '../features/find/index.ts';
import { Viewer } from '../features/viewer/index.ts';
import { PresenterCard, SelectionMenu, WalkBar, WalkthroughRuntime } from '../features/walkthrough/index.ts';
import { useIsNarrow } from '../shared/hooks/useMediaQuery.ts';
import { debounce } from '../shared/lib/util.ts';
import { useFlowStore } from '../shared/state/flowStore.ts';
import { useGlossaryStore } from '../shared/state/glossaryStore.ts';
import { useNotesStore } from '../shared/state/notesStore.ts';
import { flowId } from '../shared/storage/notes.ts';
import { applyPageTheme, saveCode } from '../shared/storage/settings.ts';
import { Store } from '../shared/storage/store.ts';
import { Button } from '../shared/ui/Button.tsx';
import { Deferred } from '../shared/ui/Deferred.tsx';
import { Kbd } from '../shared/ui/Kbd.tsx';
import { ToastHost } from '../shared/ui/Toast.tsx';
import { toast } from '../shared/ui/toast.ts';
import { TooltipProvider } from '../shared/ui/Tooltip.tsx';
import styles from './App.module.css';
import { useDocumentTitle } from './title.ts';
import { ToolOverlay } from './tools/ToolOverlay.tsx';
import { ToolHosts } from './tools/ToolHosts.tsx';
import { TopBar } from './TopBar.tsx';
import { loadInitialCode } from './boot.ts';
import { useChromeInsets } from './useChromeInsets.ts';
import { useGlobalKeys } from './useGlobalKeys.ts';
import { useHideMode } from './useHideMode.ts';

// Downloaded on first use (plan section 5): the first load holds only what the page shows at once.
const askAi = () => import('../features/ask-ai/index.ts');
const AskDialog = lazy(() => askAi().then((m) => ({ default: m.AskDialog })));
const AiSettingsDialog = lazy(() => askAi().then((m) => ({ default: m.AiSettingsDialog })));
const guide = () => import('../features/guide/index.ts');
const GuideDialog = lazy(() => guide().then((m) => ({ default: m.GuideDialog })));
const ShortcutsDialog = lazy(() => guide().then((m) => ({ default: m.ShortcutsDialog })));
const CodePanel = lazy(() => import('../features/code-panel/index.ts').then((m) => ({ default: m.CodePanel })));
const TableView = lazy(() => import('../features/table/index.ts').then((m) => ({ default: m.TableView })));

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

  const pageTheme = settings.pageTheme;
  useEffect(() => {
    applyPageTheme(pageTheme);
  }, [pageTheme]);

  // First load: the link, then the autosaved code, then the demo flow.
  useEffect(() => {
    let cancelled = false;
    if (!Store.ok) toast('Storage is blocked here, so code, notes and bookmarks last only for this session.');
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

  const view = useFlowStore((s) => s.view);
  const hidden = ui.controlsHidden;
  const topFolded = Boolean(settings.fold?.top);
  const barFolded = Boolean(settings.fold?.bar);
  const showTop = !hidden && !topFolded;
  const codeShown = ui.codeOpen && !hidden;
  const pageRef = useRef<HTMLDivElement | null>(null);
  useChromeInsets(pageRef, `${String(showTop)} ${String(hidden)}`);

  return (
    <TooltipProvider>
      <div ref={pageRef} className={styles.app} data-hidden={hidden || undefined} data-code-open={codeShown || undefined}>
        {showTop ? <TopBar /> : null}
        <main className={styles.stage} id="stage">
          <Viewer />
          {hidden ? null : <FindPopover />}
          <PresenterCard />
          {hidden && !ui.presenter ? (
            <Button
              className={styles.showControls}
              onClick={() => setUi({ controlsHidden: false, presenter: false })}
            >
              Show controls · <Kbd>Esc</Kbd>
            </Button>
          ) : null}
          <Deferred when={ui.codeOpen}>{hidden ? null : <CodePanel />}</Deferred>
          <Deferred when={view === 'table'}>
            <TableView />
          </Deferred>
        </main>
        {hidden ? null : (
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
            <WalkBar deckFolded={barFolded} />
          </>
        )}
        <WalkthroughRuntime />
        <SelectionMenu />
        <ToolOverlay />
        <ToolHosts />
        <Deferred when={ui.askOpen || ui.aiSettingsOpen}>
          <AskDialog />
          <AiSettingsDialog />
        </Deferred>
        <Deferred when={ui.guideOpen || ui.shortcutsOpen}>
          <GuideDialog />
          <ShortcutsDialog />
        </Deferred>
        <ImportDialog />
        <ToastHost />
      </div>
    </TooltipProvider>
  );
}
