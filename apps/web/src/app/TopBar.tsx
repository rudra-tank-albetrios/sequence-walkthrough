import { ExportMenuItems } from '../features/export/index.ts';
import { useIsNarrow } from '../shared/hooks/useMediaQuery.ts';
import { plural } from '../shared/lib/util.ts';
import { useDiagramStore } from '../shared/state/diagramStore.ts';
import { useFlowStore } from '../shared/state/flowStore.ts';
import { DIAGRAM_THEMES, type DiagramTheme } from '../shared/storage/settings.ts';
import { Button } from '../shared/ui/Button.tsx';
import { Chip } from '../shared/ui/Chip.tsx';
import { Menu, MenuHeading, MenuItem, MenuRow, MenuSeparator } from '../shared/ui/Menu.tsx';
import { Select } from '../shared/ui/Select.tsx';
import styles from './TopBar.module.css';

function ThemeSelect({ id }: { id: string }) {
  const theme = useFlowStore((s) => s.settings.theme);
  const updateSettings = useFlowStore((s) => s.updateSettings);
  return (
    <Select
      id={id}
      aria-label="Diagram theme"
      value={theme}
      onChange={(e) => {
        updateSettings({ theme: e.target.value as DiagramTheme });
      }}
    >
      {DIAGRAM_THEMES.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </Select>
  );
}

/** Logo, flow name, view switch, Find, zoom, fit, wheel, theme, guide, Export menu, help, more. */
export function TopBar() {
  const flow = useFlowStore((s) => s.flow);
  const view = useFlowStore((s) => s.view);
  const setView = useFlowStore((s) => s.setView);
  const settings = useFlowStore((s) => s.settings);
  const updateSettings = useFlowStore((s) => s.updateSettings);
  const setUi = useFlowStore((s) => s.setUi);
  const zoom = useDiagramStore((s) => s.zoom);
  const commands = useDiagramStore((s) => s.commands);
  const narrow = useIsNarrow();

  const steps = flow?.isSequence ? flow.steps.length : 0;
  const layers = flow?.isSequence ? flow.participants.length : 0;
  const chapters = flow?.isSequence ? flow.sections.length : 0;
  const meta = steps
    ? [plural(steps, 'step'), plural(layers, 'layer'), chapters ? plural(chapters, 'chapter') : '']
        .filter(Boolean)
        .join(', ')
    : '';
  const toggleWheel = () => {
    updateSettings({ wheel: settings.wheel === 'scroll' ? 'zoom' : 'scroll' });
  };
  const wheelLabel = `Wheel: ${settings.wheel === 'scroll' ? 'Scroll' : 'Zoom'}`;

  return (
    <header className={styles.bar} id="topbar">
      <div className={styles.left}>
        <span className={styles.logo} aria-hidden="true">
          ◆
        </span>
        <h1 className={styles.title} id="flowName">
          {flow?.title ?? 'Sequence diagram'}
        </h1>
        {flow?.proposed ? (
          <Chip tone="unconfirmed" title="This flow is a proposed design: it does not exist in the code yet">
            proposed
          </Chip>
        ) : null}
        {meta ? <span className={styles.meta}>{meta}</span> : null}
      </div>
      <div className={styles.right}>
        <div className={`${styles.seg} ${styles.extra}`} role="group" aria-label="View">
          <button type="button" aria-pressed={view === 'diagram'} onClick={() => setView('diagram')}>
            Diagram
          </button>
          <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}>
            Table
          </button>
        </div>
        <Button className={styles.extra} title="Find (/)" onClick={() => setUi({ findOpen: true })}>
          <span aria-hidden="true">⌕</span> Find
        </Button>
        <div className={`${styles.zoom} ${styles.extra}`} role="group" aria-label="Zoom">
          <button type="button" aria-label="Zoom out" title="Zoom out (−)" onClick={commands.zoomOut}>
            −
          </button>
          <button type="button" title="Set zoom to 100%" onClick={() => commands.zoomTo(1)}>
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" aria-label="Zoom in" title="Zoom in (+)" onClick={commands.zoomIn}>
            +
          </button>
        </div>
        <Button className={styles.extra} title="Fit width (0). Fit all (F)" onClick={commands.fitWidth}>
          Fit
        </Button>
        <Button
          className={`${styles.extra} ${styles.extraMd}`}
          pressed={settings.wheel === 'zoom'}
          title="Mouse wheel behaviour"
          onClick={toggleWheel}
        >
          {wheelLabel}
        </Button>
        <span className={`${styles.extra} ${styles.extraMd}`}>
          <ThemeSelect id="themeSel" />
        </span>
        <Button
          className={styles.extra}
          title="How the viewer and the Claude skill work"
          onClick={() => setUi({ guideOpen: true })}
        >
          How it works
        </Button>
        <Button
          className={styles.extra}
          title="A short walk through every feature, with no key needed"
          onClick={() => setUi({ tourOpen: true })}
        >
          Take the tour
        </Button>
        <span className={styles.extra} data-tour="exports">
          <Menu label="Export and share" trigger={<Button>Export ▾</Button>}>
            <ExportMenuItems />
          </Menu>
        </span>
        <Button
          icon
          className={styles.extra}
          aria-label="Keyboard shortcuts and help"
          title="Shortcuts (?)"
          onClick={() => setUi({ shortcutsOpen: true })}
        >
          ?
        </Button>
        <span className={styles.more} data-tour="exports">
          <Menu label="More" trigger={<Button icon aria-label="More">⋯</Button>}>
            <MenuItem onSelect={() => setUi({ tourOpen: true })}>Take the tour</MenuItem>
            <MenuItem onSelect={() => setUi({ guideOpen: true })}>How it works</MenuItem>
            <MenuItem onSelect={() => setView(view === 'diagram' ? 'table' : 'diagram')}>
              {view === 'diagram' ? 'Switch to table view' : 'Switch to diagram view'}
            </MenuItem>
            <MenuItem onSelect={() => setUi({ insightOpen: true })}>Insight panel</MenuItem>
            <MenuItem onSelect={() => setUi({ aiSettingsOpen: true })}>Ask AI settings</MenuItem>
            <MenuItem onSelect={() => setUi({ findOpen: true })}>Find</MenuItem>
            <MenuItem onSelect={commands.fitWidth}>Fit width</MenuItem>
            <MenuItem onSelect={commands.fitAll}>Fit all</MenuItem>
            <MenuItem onSelect={toggleWheel}>{wheelLabel}</MenuItem>
            <MenuRow>
              <span className={styles.hint}>Theme</span>
              <ThemeSelect id="themeSel2" />
            </MenuRow>
            {narrow ? (
              <>
                <MenuSeparator />
                <MenuHeading>Export and share</MenuHeading>
                <ExportMenuItems />
              </>
            ) : null}
            <MenuSeparator />
            <MenuItem onSelect={() => setUi({ shortcutsOpen: true })}>Shortcuts and help</MenuItem>
          </Menu>
        </span>
      </div>
    </header>
  );
}
