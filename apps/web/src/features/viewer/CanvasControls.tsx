import { CodeXml, Contrast, EyeOff, Maximize, Minus, Mouse, Plus, Rows3 } from 'lucide-react';

import { cx } from '../../shared/lib/util.ts';
import { useDiagramStore } from '../../shared/state/diagramStore.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { Button } from '../../shared/ui/Button.tsx';
import styles from './viewer.module.css';

const ICON = { size: 16, 'aria-hidden': true } as const;

/** The percent between the zoom buttons: its own part, so only it follows every zoom change. */
function ZoomLevel() {
  const zoom = useDiagramStore((s) => s.zoom);
  const commands = useDiagramStore((s) => s.commands);
  return (
    <button type="button" className={styles.zoomValue} title="Set zoom to 100%" onClick={() => commands.zoomTo(1)}>
      {Math.round(zoom * 100)}%
    </button>
  );
}

/** Code at the top left of the canvas; zoom, fit and view switches in a column at the top right. */
export function CanvasControls() {
  const codeOpen = useFlowStore((s) => s.ui.codeOpen);
  const hidden = useFlowStore((s) => s.ui.controlsHidden);
  const settings = useFlowStore((s) => s.settings);
  const setUi = useFlowStore((s) => s.setUi);
  const updateSettings = useFlowStore((s) => s.updateSettings);
  const commands = useDiagramStore((s) => s.commands);
  const syntaxError = useDiagramStore((s) => s.error);
  const unexplained = useFlowStore((s) => s.flow?.lint.filter((l) => l.code === 'no-step').length ?? 0);
  const wheelZoom = settings.wheel === 'zoom';

  if (hidden) return null;

  return (
    <>
      <Button
        className={styles.codeBtn}
        aria-expanded={codeOpen}
        aria-controls="codePanel"
        title="Code (C)"
        data-canvas-ui
        data-tour="code"
        onClick={() => {
          setUi({ codeOpen: !codeOpen });
        }}
      >
        <CodeXml {...ICON} /> Code
        {syntaxError !== null ? (
          <span className={cx(styles.count, styles.countErr)} data-testid="code-count">
            error
          </span>
        ) : unexplained > 0 ? (
          <span className={styles.count} data-testid="code-count">
            {unexplained} unexplained
          </span>
        ) : null}
      </Button>
      <div className={styles.tools} role="group" aria-label="Diagram view" data-canvas-ui data-tour="canvas-tools">
        <Button variant="ghost" icon aria-label="Zoom in" title="Zoom in (+)" onClick={commands.zoomIn}>
          <Plus {...ICON} />
        </Button>
        <ZoomLevel />
        <Button variant="ghost" icon aria-label="Zoom out" title="Zoom out (-)" onClick={commands.zoomOut}>
          <Minus {...ICON} />
        </Button>
        <Button
          variant="ghost"
          icon
          aria-label="Fit"
          title="Fit width (0). Fit all (F)"
          onClick={commands.fitWidth}
        >
          <Maximize {...ICON} />
        </Button>
        <span className={styles.toolsRule} aria-hidden="true" />
        <Button
          variant="ghost"
          icon
          className={styles.toolExtra}
          pressed={settings.dim}
          aria-label="Dim others"
          title="Fade the other arrows"
          onClick={() => {
            updateSettings({ dim: !settings.dim });
          }}
        >
          <Contrast {...ICON} />
        </Button>
        <Button
          variant="ghost"
          icon
          className={styles.toolExtra}
          pressed={settings.bands}
          aria-label="Chapter band"
          title="Colour band behind the current chapter"
          onClick={() => {
            updateSettings({ bands: !settings.bands });
          }}
        >
          <Rows3 {...ICON} />
        </Button>
        <Button
          variant="ghost"
          icon
          className={styles.toolExtra}
          id="wheelBtn"
          pressed={wheelZoom}
          title={
            wheelZoom
              ? 'The wheel zooms like mermaid.live. Click to scroll instead.'
              : 'The wheel scrolls; Ctrl + wheel zooms. Click to zoom with the wheel.'
          }
          onClick={() => {
            updateSettings({ wheel: wheelZoom ? 'scroll' : 'zoom' });
          }}
        >
          <Mouse {...ICON} />
          <span className="sr-only">Wheel: {wheelZoom ? 'Zoom' : 'Scroll'}</span>
        </Button>
        <Button
          variant="ghost"
          icon
          className={styles.toolExtra}
          aria-label="Hide controls"
          title="Hide controls (H)"
          onClick={() => {
            setUi({ controlsHidden: true });
          }}
        >
          <EyeOff {...ICON} />
        </Button>
      </div>
    </>
  );
}
