import { useState } from 'react';

import { useFlowStore } from '../../shared/state/flowStore.ts';
import { Button } from '../../shared/ui/Button.tsx';
import { Dialog } from '../../shared/ui/Dialog.tsx';
import { toast } from '../../shared/ui/toast.ts';
import { normalizeSettings, useAiSettingsStore, type AiSettings } from './aiSettings.ts';
import { ProviderFields } from './ProviderFields.tsx';
import { PROVIDERS } from './providers.ts';
import { complete, TEST_QUESTION } from './request.ts';
import styles from './settings.module.css';

const INTRO =
  "Short answers about any step or word, from a model you choose. The key is stored only in this browser and is sent only to that provider. Check the provider's current free tier before relying on it.";

/** Provider, key and model for Ask AI (`swv:ai`). Opens from the panel's ⚙, the menus and Export. */
export function AiSettingsDialog() {
  const open = useFlowStore((s) => s.ui.aiSettingsOpen);
  const setUi = useFlowStore((s) => s.setUi);
  const close = () => setUi({ aiSettingsOpen: false });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title="Ask AI"
      description={INTRO}
      showDescription
    >
      {open ? <SettingsBody onClose={close} /> : null}
    </Dialog>
  );
}

/** Edits a copy; nothing is stored until Save. Mounted only while the dialog is open. */
function SettingsBody({ onClose }: { onClose: () => void }) {
  const stored = useAiSettingsStore((s) => s.settings);
  const replace = useAiSettingsStore((s) => s.replace);
  const [draft, setDraft] = useState<AiSettings>(() => ({
    ...stored,
    keys: { ...stored.keys },
    models: { ...stored.models },
  }));
  const [status, setStatus] = useState('');
  const [testing, setTesting] = useState(false);
  const patch = (changes: Partial<AiSettings>) => setDraft((d) => ({ ...d, ...changes }));

  const test = async () => {
    setTesting(true);
    setStatus('Testing…');
    try {
      const text = await complete(normalizeSettings(draft), TEST_QUESTION);
      setStatus(`Works. The model said: ${text.trim().slice(0, 60)}`);
    } catch (err) {
      setStatus(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTesting(false);
    }
  };

  const save = () => {
    replace(normalizeSettings(draft));
    onClose();
    toast('AI settings saved in this browser');
  };

  return (
    <div>
      <fieldset className={styles.providers}>
        <legend>Provider</legend>
        {PROVIDERS.map((p) => (
          <label key={p.id} className={styles.provider}>
            <input
              type="radio"
              name="ai-provider"
              value={p.id}
              checked={draft.provider === p.id}
              onChange={() => patch({ provider: p.id })}
            />
            <span className={styles.name}>{p.name}</span>
            {p.model ? (
              <span className={`${styles.model} mono`} title="Default model">
                {p.model}
              </span>
            ) : (
              <span />
            )}
          </label>
        ))}
      </fieldset>
      <ProviderFields draft={draft} onChange={patch} />
      <label className={styles.opt}>
        <input
          type="checkbox"
          checked={draft.includePayload}
          onChange={(e) => patch({ includePayload: e.target.checked })}
        />
        Include the step&apos;s payload in the question (project mode)
      </label>
      <label className={styles.opt}>
        <input type="checkbox" checked={draft.autoNote} onChange={(e) => patch({ autoNote: e.target.checked })} />
        Save every answer to the step&apos;s note, so it can be edited later
      </label>
      <p className={styles.status} role="status" aria-live="polite">
        {status}
      </p>
      <div className={styles.foot}>
        <Button onClick={() => void test()} disabled={testing}>
          Test
        </Button>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={save}>
          Save
        </Button>
      </div>
    </div>
  );
}
