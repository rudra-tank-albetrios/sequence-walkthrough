import * as Tabs from '@radix-ui/react-tabs';
import { ArrowUpRight, X } from 'lucide-react';
import { Suspense, useEffect, useRef, useState, type KeyboardEvent } from 'react';

import { useFlowStore } from '../../shared/state/flowStore.ts';
import { Button } from '../../shared/ui/Button.tsx';
import { Overlay, OverlayClose, OverlayTitle } from '../../shared/ui/Overlay.tsx';
import { rememberFocus, takeOpener } from './overlayFocus.ts';
import { activate, findTool, GROUPS, toolsOf, type Tool } from './registry.ts';
import styles from './ToolOverlay.module.css';

const FIELD = 'input, textarea, select, [contenteditable]';

function Skeleton() {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

/** One row of the side list: the tool's icon, its name and how many things it lists. */
function ToolName({ tool }: { tool: Tool }) {
  const flow = useFlowStore((s) => s.flow);
  const Icon = tool.icon;
  const count = flow?.isSequence ? tool.count?.(flow) : undefined;
  return (
    <>
      <Icon size={16} aria-hidden="true" />
      <span className={styles.name}>{tool.label}</span>
      {count ? <span className={styles.count}>{count}</span> : null}
    </>
  );
}

/** The inside of the overlay: the group's tools down the side, the open tool beside them. */
function OverlayBody({ tool, leave }: { tool: Tool; leave: (then: () => void) => void }) {
  const setUi = useFlowStore((s) => s.setUi);
  const group = GROUPS.find((g) => g.id === tool.group);
  const siblings = toolsOf(tool.group);
  const Panel = 'panel' in tool ? tool.panel : null;
  return (
    <Tabs.Root
      className={styles.layout}
      orientation="vertical"
      value={tool.id}
      onValueChange={(id) => {
        leave(() => {
          setUi({ overlayTool: id });
        });
      }}
    >
      <div className={styles.side}>
        <p className={styles.group}>{group?.label}</p>
        <Tabs.List className={styles.tabs} aria-label={`${group?.label ?? ''} tools`}>
          {siblings.map((sibling) =>
            'panel' in sibling ? (
              <Tabs.Trigger key={sibling.id} value={sibling.id} className={styles.tab} data-tour={sibling.tour}>
                <ToolName tool={sibling} />
              </Tabs.Trigger>
            ) : null,
          )}
        </Tabs.List>
        <div className={styles.actions}>
          {siblings.map((sibling) =>
            'run' in sibling ? (
              <button
                key={sibling.id}
                type="button"
                className={styles.tab}
                data-tour={sibling.tour}
                onClick={() => {
                  activate(sibling);
                }}
              >
                <ToolName tool={sibling} />
                <ArrowUpRight size={14} aria-hidden="true" />
              </button>
            ) : null,
          )}
        </div>
      </div>
      <Tabs.Content value={tool.id} className={styles.main} tabIndex={-1}>
        <OverlayTitle asChild>
          <h2 className={styles.title}>{tool.label}</h2>
        </OverlayTitle>
        <div className={styles.body}>
          {Panel ? (
            <Suspense fallback={<Skeleton />}>
              <Panel />
            </Suspense>
          ) : null}
        </div>
      </Tabs.Content>
    </Tabs.Root>
  );
}

/**
 * The big panel for the tools of a group. The page behind it does not change, so the same flow, step
 * and zoom are there afterwards. A tool that would lose work on leaving sets `ui.overlayGuard`, and
 * this asks before closing or switching.
 */
export function ToolOverlay() {
  const toolId = useFlowStore((s) => s.ui.overlayTool);
  const guard = useFlowStore((s) => s.ui.overlayGuard);
  const setUi = useFlowStore((s) => s.setUi);
  const tool = findTool(toolId);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const keepGoing = useRef<HTMLButtonElement | null>(null);

  useEffect(
    () =>
      useFlowStore.subscribe((state, before) => {
        if (state.ui.overlayTool && !before.ui.overlayTool) rememberFocus();
      }),
    [],
  );

  useEffect(() => {
    if (pending) keepGoing.current?.focus();
  }, [pending]);

  const leave = (then: () => void) => {
    if (guard) setPending(() => then);
    else then();
  };
  const close = () => {
    leave(() => {
      setUi({ overlayTool: null, overlayGuard: null });
    });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // I opens the overlay, so it closes it too, as it did for the Insight panel.
    const inField = event.target instanceof Element && event.target.closest(FIELD);
    if (event.key.toLowerCase() !== 'i' || inField || event.ctrlKey || event.metaKey || event.altKey) return;
    // Handled here: the page's own key map runs after the overlay is gone and would open it again.
    event.preventDefault();
    close();
  };

  return (
    <Overlay open={Boolean(tool)} onClose={close} onReturnFocus={takeOpener}>
      {tool ? (
        <div className={styles.frame} onKeyDown={onKeyDown}>
          <OverlayBody tool={tool} leave={leave} />
          <OverlayClose asChild>
            <Button variant="ghost" icon className={styles.close} aria-label="Close" title="Close (Esc)">
              <X size={18} aria-hidden="true" />
            </Button>
          </OverlayClose>
          {pending ? (
            <div className={styles.guard} role="alertdialog" aria-label="Leave this tool?" data-testid="overlay-guard">
              <p>{guard}</p>
              <Button
                ref={keepGoing}
                variant="primary"
                onClick={() => {
                  setPending(null);
                }}
              >
                Keep going
              </Button>
              <Button
                onClick={() => {
                  setUi({ overlayGuard: null });
                  setPending(null);
                  pending();
                }}
              >
                Leave
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Overlay>
  );
}
