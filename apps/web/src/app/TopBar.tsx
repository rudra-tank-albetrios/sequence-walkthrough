import { ChevronDown, CircleHelp, Ellipsis, Search } from 'lucide-react';
import { useRef } from 'react';

import { plural } from '../shared/lib/util.ts';
import { useDiagramStore } from '../shared/state/diagramStore.ts';
import { useFlowStore } from '../shared/state/flowStore.ts';
import { Button } from '../shared/ui/Button.tsx';
import { Chip } from '../shared/ui/Chip.tsx';
import { Menu, MenuHeading, MenuItem, MenuSeparator } from '../shared/ui/Menu.tsx';
import { BrandMark } from './BrandMark.tsx';
import { GROUPS, type ToolGroup } from './tools/registry.ts';
import { ToolMenuItems } from './tools/ToolMenuItems.tsx';
import styles from './TopBar.module.css';

/** The overlay takes the focus when a menu item opens it, so the closing menu must not take it back. */
const keepOverlayFocus = (event: Event) => {
  if (useFlowStore.getState().ui.overlayTool) event.preventDefault();
};

/** "Step 12 of 48" while walking, the flow's size on the overview: its own part, as it changes per step. */
function FlowMeta() {
  const flow = useFlowStore((s) => s.flow);
  const cur = useFlowStore((s) => s.cur);
  if (!flow) return null;
  if (!flow.isSequence) {
    return (
      <span className={styles.meta} id="flowMeta">
        {flow.diagramType}
      </span>
    );
  }
  const steps = flow.steps.length;
  if (!steps) return null;
  const size = [
    plural(steps, 'step'),
    plural(flow.participants.length, 'layer'),
    flow.sections.length ? plural(flow.sections.length, 'chapter') : '',
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <span className={styles.meta} id="flowMeta" title={size}>
      {cur >= 0 ? `Step ${String(cur + 1)} of ${String(steps)}` : size}
    </span>
  );
}

function ToolGroupMenu({ group }: { group: ToolGroup }) {
  const opener = useRef<HTMLButtonElement | null>(null);
  const Icon = group.icon;
  return (
    <Menu
      label={group.menuLabel}
      onCloseAutoFocus={keepOverlayFocus}
      trigger={
        <Button
          ref={opener}
          variant="ghost"
          className={styles.group}
          aria-label={group.label}
          title={group.label}
          data-tour={group.tour}
        >
          <Icon size={16} aria-hidden="true" />
          <span className={styles.groupLabel}>{group.label}</span>
          <ChevronDown className={styles.chevron} size={13} aria-hidden="true" />
        </Button>
      }
    >
      <ToolMenuItems group={group.id} opener={opener} />
    </Menu>
  );
}

/** The phone's one menu: the view switch, Find, the diagram's view controls and every tool group. */
function MoreMenu() {
  const opener = useRef<HTMLButtonElement | null>(null);
  const view = useFlowStore((s) => s.view);
  const setView = useFlowStore((s) => s.setView);
  const setUi = useFlowStore((s) => s.setUi);
  const settings = useFlowStore((s) => s.settings);
  const updateSettings = useFlowStore((s) => s.updateSettings);
  const commands = useDiagramStore((s) => s.commands);
  return (
    <Menu
      label="More"
      onCloseAutoFocus={keepOverlayFocus}
      trigger={
        <Button ref={opener} icon variant="ghost" aria-label="More">
          <Ellipsis size={18} aria-hidden="true" />
        </Button>
      }
    >
      <MenuItem onSelect={() => setView(view === 'diagram' ? 'table' : 'diagram')}>
        {view === 'diagram' ? 'Switch to table view' : 'Switch to diagram view'}
      </MenuItem>
      <MenuItem onSelect={() => setUi({ findOpen: true })}>Find</MenuItem>
      <MenuItem onSelect={commands.fitWidth}>Fit width</MenuItem>
      <MenuItem onSelect={commands.fitAll}>Fit all</MenuItem>
      <MenuItem onSelect={() => updateSettings({ dim: !settings.dim })}>
        {settings.dim ? 'Stop dimming the others' : 'Dim others'}
      </MenuItem>
      <MenuItem onSelect={() => updateSettings({ bands: !settings.bands })}>
        {settings.bands ? 'Hide the chapter band' : 'Show the chapter band'}
      </MenuItem>
      <MenuItem onSelect={() => setUi({ controlsHidden: true })}>Hide controls</MenuItem>
      {GROUPS.map((group) => (
        <div key={group.id}>
          <MenuSeparator />
          <MenuHeading>{group.menuLabel}</MenuHeading>
          <ToolMenuItems group={group.id} opener={opener} />
        </div>
      ))}
    </Menu>
  );
}

/** Slim glass bar: the brand, the flow and where you are in it, the view switch, Find and the tool groups. */
export function TopBar() {
  const title = useFlowStore((s) => s.flow?.title);
  const proposed = useFlowStore((s) => s.flow?.proposed);
  const view = useFlowStore((s) => s.view);
  const setView = useFlowStore((s) => s.setView);
  const setUi = useFlowStore((s) => s.setUi);

  return (
    <header className={styles.bar} id="topbar" data-chrome="top" data-tour="header">
      <span className={styles.brand}>
        <BrandMark />
        <span className={styles.word}>Sequence Walkthrough</span>
      </span>
      <span className={styles.rule} aria-hidden="true" />
      <div className={styles.flow}>
        <h1 className={styles.title} id="flowName">
          {title ?? 'Sequence diagram'}
        </h1>
        {proposed ? (
          <Chip tone="unconfirmed" title="This flow is a proposed design: it does not exist in the code yet">
            proposed
          </Chip>
        ) : null}
        <FlowMeta />
      </div>
      <div className={styles.tools}>
        <div className={styles.seg} role="group" aria-label="View" data-tour="view-switch">
          <button type="button" aria-pressed={view === 'diagram'} onClick={() => setView('diagram')}>
            Diagram
          </button>
          <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}>
            Table
          </button>
        </div>
        <Button
          variant="ghost"
          className={styles.group}
          aria-label="Find"
          title="Find (/)"
          data-tour="find"
          onClick={() => setUi({ findOpen: true })}
        >
          <Search size={16} aria-hidden="true" />
          <span className={styles.groupLabel}>Find</span>
        </Button>
        <span className={styles.rule} aria-hidden="true" />
        {GROUPS.map((group) => (
          <ToolGroupMenu key={group.id} group={group} />
        ))}
        <Button
          variant="ghost"
          icon
          aria-label="Keyboard shortcuts and help"
          title="Shortcuts (?)"
          onClick={() => setUi({ shortcutsOpen: true })}
        >
          <CircleHelp size={16} aria-hidden="true" />
        </Button>
      </div>
      <span className={styles.phone}>
        <MoreMenu />
      </span>
    </header>
  );
}
