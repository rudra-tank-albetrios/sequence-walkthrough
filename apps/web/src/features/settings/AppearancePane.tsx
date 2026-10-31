import { useMediaQuery } from '../../shared/hooks/useMediaQuery.ts';
import { useVoices } from '../../shared/hooks/useVoices.ts';
import { pickVoice, VOICE_RATES } from '../../shared/lib/speech.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import {
  DARK_QUERY,
  DIAGRAM_THEMES,
  diagramTheme,
  PAGE_THEMES,
  type DiagramTheme,
  type PageTheme,
} from '../../shared/storage/settings.ts';
import { Select } from '../../shared/ui/Select.tsx';
import styles from './settings.module.css';

const PAGE_LABEL: Record<PageTheme, string> = { system: 'Follow the system', light: 'Light', dark: 'Dark' };

/** A labelled on and off switch for one display setting. */
function Toggle({
  label,
  hint,
  on,
  onChange,
}: {
  label: string;
  hint: string;
  on: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className={styles.toggle}>
      <input
        type="checkbox"
        checked={on}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
      />
      <span>
        <b>{label}</b>
        <small>{hint}</small>
      </span>
    </label>
  );
}

/** How the voice reads a step while playing. Hidden where the device has no voices. */
function VoiceBlock() {
  const rate = useFlowStore((s) => s.settings.voiceRate);
  const savedVoice = useFlowStore((s) => s.settings.voiceURI);
  const updateSettings = useFlowStore((s) => s.updateSettings);
  const voices = useVoices();
  if (voices.length === 0) return null;
  return (
    <section className={styles.block}>
      <h3 className={styles.heading}>Voice</h3>
      <label className={styles.field}>
        <span>Voice speed</span>
        <Select
          aria-label="Voice speed"
          value={rate}
          onChange={(event) => {
            updateSettings({ voiceRate: Number(event.target.value) });
          }}
        >
          {VOICE_RATES.map((option) => (
            <option key={option} value={option}>
              {option}x
            </option>
          ))}
        </Select>
      </label>
      <label className={styles.field}>
        <span>Voice</span>
        <Select
          aria-label="Voice"
          value={pickVoice(voices, savedVoice, navigator.language)?.voiceURI ?? ''}
          onChange={(event) => {
            updateSettings({ voiceURI: event.target.value });
          }}
        >
          {voices.map((voice) => (
            <option key={voice.voiceURI} value={voice.voiceURI}>
              {voice.name} ({voice.lang})
            </option>
          ))}
        </Select>
      </label>
      <p className={styles.intro}>
        Voices come from this device, so how they sound depends on it. Some voices are online services run by your
        browser or system, and they receive the text they read.
      </p>
    </section>
  );
}

/** The page's colours, the diagram's theme, how the diagram is shown, and the voice. */
export function AppearancePane() {
  const settings = useFlowStore((s) => s.settings);
  const updateSettings = useFlowStore((s) => s.updateSettings);
  const systemDark = useMediaQuery(DARK_QUERY);
  const pageDark = settings.pageTheme === 'system' ? systemDark : settings.pageTheme === 'dark';
  return (
    <div className={styles.pane}>
      <fieldset className={styles.choice}>
        <legend>Page colours</legend>
        <div className={styles.seg}>
          {PAGE_THEMES.map((theme) => (
            <label key={theme}>
              <input
                type="radio"
                name="pageTheme"
                checked={settings.pageTheme === theme}
                onChange={() => {
                  updateSettings({ pageTheme: theme });
                }}
              />
              <span>{PAGE_LABEL[theme]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <section className={styles.block}>
        <label className={styles.heading} htmlFor="themeSel">
          Diagram theme
        </label>
        <Select
          id="themeSel"
          aria-label="Diagram theme"
          value={diagramTheme(settings, pageDark)}
          onChange={(event) => {
            updateSettings({ theme: event.target.value as DiagramTheme, themeAuto: false });
          }}
        >
          {DIAGRAM_THEMES.map((theme) => (
            <option key={theme} value={theme}>
              {theme}
            </option>
          ))}
        </Select>
        <Toggle
          label="Match the page"
          hint="Redux Color on light pages, Redux Dark Color on dark ones. Picking a theme above turns this off."
          on={settings.themeAuto}
          onChange={(themeAuto) => {
            updateSettings({ themeAuto });
          }}
        />
      </section>
      <section className={styles.block}>
        <h3 className={styles.heading}>Display</h3>
        <Toggle
          label="Dot grid"
          hint="Dots behind the diagram that move with it."
          on={settings.grid}
          onChange={(grid) => {
            updateSettings({ grid });
          }}
        />
        <Toggle
          label="Dim others"
          hint="Fade every arrow except the current step."
          on={settings.dim}
          onChange={(dim) => {
            updateSettings({ dim });
          }}
        />
        <Toggle
          label="Chapter band"
          hint="A colour band behind the current chapter."
          on={settings.bands}
          onChange={(bands) => {
            updateSettings({ bands });
          }}
        />
        <Toggle
          label="Wheel zooms"
          hint="The mouse wheel zooms like mermaid.live. Off, it scrolls and Ctrl + wheel zooms."
          on={settings.wheel === 'zoom'}
          onChange={(zoom) => {
            updateSettings({ wheel: zoom ? 'zoom' : 'scroll' });
          }}
        />
      </section>
      <VoiceBlock />
    </div>
  );
}
