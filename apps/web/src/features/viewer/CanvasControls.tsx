import { Button } from '../../shared/ui/Button.tsx';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import styles from './viewer.module.css';

const SPEEDS = [1000, 2000, 3000, 4000, 5000];

/** The buttons at the bottom of the canvas: Code, Play, speed, Dim others, Chapter band, Insight, Hide. */
export function CanvasControls() {
  const flow = useFlowStore((s) => s.flow);
  const playing = useFlowStore((s) => s.playing);
  const settings = useFlowStore((s) => s.settings);
  const ui = useFlowStore((s) => s.ui);
  const setUi = useFlowStore((s) => s.setUi);
  const setPlaying = useFlowStore((s) => s.setPlaying);
  const updateSettings = useFlowStore((s) => s.updateSettings);
  const lintCount = flow?.lint.length ?? 0;
  const isSequence = flow?.isSequence ?? false;

  return (
    <div className={styles.controls} data-canvas-ui>
      <Button
        className={styles.codeBtn}
        aria-expanded={ui.codeOpen}
        aria-controls="codePanel"
        title="Code (C)"
        onClick={() => {
          setUi({ codeOpen: !ui.codeOpen });
        }}
      >
        <span aria-hidden="true">&lt;/&gt;</span> Code
        {lintCount > 0 ? (
          <span className={styles.count} title={`${lintCount} annotation warning${lintCount === 1 ? '' : 's'}`}>
            {lintCount}
          </span>
        ) : null}
      </Button>
      <div className={styles.controlsRight}>
        <Button
          pressed={playing}
          disabled={!isSequence}
          title="Play / pause (Space)"
          onClick={() => {
            setPlaying(!playing);
          }}
        >
          <span aria-hidden="true">{playing ? '❚❚' : '▶'}</span>{' '}
          <span className={styles.lbl}>{playing ? 'Pause' : 'Play'}</span>
        </Button>
        <select
          className={styles.select}
          aria-label="Seconds per step"
          title="Seconds per step"
          value={settings.speed}
          onChange={(e) => {
            updateSettings({ speed: Number(e.target.value) });
          }}
        >
          {SPEEDS.map((ms) => (
            <option key={ms} value={ms}>
              {ms / 1000} s
            </option>
          ))}
        </select>
        <Button
          pressed={settings.dim}
          title="Fade the other arrows"
          onClick={() => {
            updateSettings({ dim: !settings.dim });
          }}
        >
          <span aria-hidden="true">◐</span> <span className={styles.lbl}>Dim others</span>
        </Button>
        <Button
          pressed={settings.bands}
          title="Colour band behind the current chapter"
          onClick={() => {
            updateSettings({ bands: !settings.bands });
          }}
        >
          <span aria-hidden="true">▭</span> <span className={styles.lbl}>Chapter band</span>
        </Button>
        <Button
          pressed={ui.insightOpen}
          title="Insight panel: layers, endpoints, errors, side parts, glossary, data (I)"
          onClick={() => {
            setUi({ insightOpen: !ui.insightOpen });
          }}
        >
          <span aria-hidden="true">☰</span> <span className={styles.lbl}>Insight</span>
        </Button>
        <Button
          title="Hide controls (H)"
          onClick={() => {
            setUi({ controlsHidden: true });
          }}
        >
          <span aria-hidden="true">⛶</span> <span className={styles.lbl}>Hide</span>
        </Button>
      </div>
    </div>
  );
}
