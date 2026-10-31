import {
  applyEdit,
  forgetUsage,
  newModel,
  presetFor,
  PRESETS,
  testModel,
  urlProblem,
  type ModelEntry,
  type PresetId,
} from '@swv/ai';
import { Eye, EyeOff } from 'lucide-react';
import { useId, useState } from 'react';

import { Button } from '../../shared/ui/Button.tsx';
import { Select } from '../../shared/ui/Select.tsx';
import { toast } from '../../shared/ui/toast.ts';
import { saveModel } from './aiStore.ts';
import styles from './settings.module.css';

const hostOf = (url: string): string => url.replace(/^https?:\/\//, '');

const limitOf = (text: string): number | null => {
  const value = Number(text);
  return text.trim() && Number.isFinite(value) && value > 0 ? value : null;
};

/** The first problem that stops this entry being saved, or null. */
function formProblem(draft: ModelEntry): string | null {
  if (!draft.name.trim()) return 'Give the model a name.';
  if (draft.preset === 'custom') {
    const problem = urlProblem(draft.url);
    if (problem) return problem;
  }
  return !presetFor(draft.preset).artifact && !draft.model.trim() ? 'Add the model name.' : null;
}

export interface ModelFormProps {
  /** The saved entry being edited, or null when adding a new one. */
  original: ModelEntry | null;
  onDone: () => void;
}

/** Adds or edits one model. Nothing is stored until Save. */
export function ModelForm({ original, onDone }: ModelFormProps) {
  const [draft, setDraft] = useState<ModelEntry>(() => original ?? newModel('groq'));
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState('');
  const [testing, setTesting] = useState(false);
  const ids = useId();
  const preset = presetFor(draft.preset);
  const patch = (changes: Partial<ModelEntry>) => {
    setDraft((d) => ({ ...d, ...changes }));
  };

  /** A key is never sent to a different URL than it was meant for, so a move drops it at once. */
  const moveTo = (next: ModelEntry, from: ModelEntry) => {
    const moved = applyEdit(from, next);
    if (next.key && !moved.key) setStatus('The address changed, so the key was removed. Paste the key for this address.');
    setDraft(moved);
  };

  const choosePreset = (id: PresetId) => {
    const old = presetFor(draft.preset);
    const { name, model } = presetFor(id);
    moveTo(
      {
        ...draft,
        preset: id,
        url: id === 'custom' ? draft.url : '',
        name: !draft.name || draft.name === old.name ? name : draft.name,
        model: !draft.model || draft.model === old.model ? model : draft.model,
      },
      draft,
    );
  };

  const trimmed = (): ModelEntry => ({
    ...draft,
    name: draft.name.trim(),
    url: draft.url.trim(),
    model: draft.model.trim(),
    key: draft.key.trim(),
  });

  const test = async () => {
    setTesting(true);
    setStatus('Testing…');
    const check = await testModel(trimmed());
    setStatus(check.message);
    setTesting(false);
  };

  const save = () => {
    const problem = formProblem(draft);
    if (problem) {
      setStatus(problem);
      return;
    }
    saveModel(trimmed());
    toast('AI settings saved in this browser');
    onDone();
  };

  return (
    <form
      className={styles.form}
      aria-label={original ? `Edit ${original.name}` : 'Add a model'}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className={styles.field}>
        <label htmlFor={`${ids}-preset`}>Provider</label>
        <Select
          id={`${ids}-preset`}
          value={draft.preset}
          onChange={(e) => {
            choosePreset(e.target.value as PresetId);
          }}
        >
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </div>
      {preset.artifact ? (
        <p className={styles.muted}>Works only when this page is opened as a Claude artifact. It needs no key.</p>
      ) : null}
      {draft.preset === 'custom' ? (
        <div className={styles.field}>
          <label htmlFor={`${ids}-url`}>Model link</label>
          <input
            id={`${ids}-url`}
            type="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://your-proxy.example/v1/chat/completions"
            value={draft.url}
            onChange={(e) => {
              const next = { ...draft, url: e.target.value };
              moveTo(next, original ?? next);
            }}
          />
        </div>
      ) : null}
      <div className={styles.field}>
        <label htmlFor={`${ids}-name`}>Name</label>
        <input
          id={`${ids}-name`}
          type="text"
          autoComplete="off"
          value={draft.name}
          onChange={(e) => {
            patch({ name: e.target.value });
          }}
        />
      </div>
      {preset.artifact ? null : (
        <div className={styles.field}>
          <label htmlFor={`${ids}-model`}>Model</label>
          <input
            id={`${ids}-model`}
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder={preset.model || 'model name'}
            value={draft.model}
            onChange={(e) => {
              patch({ model: e.target.value });
            }}
          />
        </div>
      )}
      {preset.key === 'none' ? null : (
        <>
          <div className={styles.field}>
            <label htmlFor={`${ids}-key`}>API key</label>
            <div className={styles.keyRow}>
              <input
                id={`${ids}-key`}
                type={showKey ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                placeholder={preset.key === 'optional' ? 'Optional' : 'Paste the key'}
                value={draft.key}
                onChange={(e) => {
                  patch({ key: e.target.value });
                }}
              />
              <Button
                icon
                aria-label={showKey ? 'Hide the key' : 'Show the key'}
                aria-pressed={showKey}
                title={showKey ? 'Hide the key' : 'Show the key'}
                onClick={() => {
                  setShowKey((v) => !v);
                }}
              >
                {showKey ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </Button>
            </div>
          </div>
          {preset.keyPage ? (
            <p className={styles.muted}>
              Get a key at{' '}
              <a href={preset.keyPage} target="_blank" rel="noopener noreferrer">
                {hostOf(preset.keyPage)}
              </a>
              .
            </p>
          ) : null}
        </>
      )}
      {draft.preset === 'ollama' ? (
        <p className={styles.muted}>
          Start Ollama with <code className="mono">OLLAMA_ORIGINS=*</code> so this page may call it, and pull a model
          first (<code className="mono">ollama pull llama3.2</code>).
        </p>
      ) : null}
      <fieldset className={styles.limits}>
        <legend>Your limits (optional)</legend>
        <p className={styles.muted}>Used for an estimate when the provider does not report its usage to browsers.</p>
        <div className={styles.field}>
          <label htmlFor={`${ids}-rpd`}>Requests a day</label>
          <input
            id={`${ids}-rpd`}
            type="number"
            min={1}
            inputMode="numeric"
            value={draft.limits.requestsPerDay ?? ''}
            onChange={(e) => {
              patch({ limits: { ...draft.limits, requestsPerDay: limitOf(e.target.value) } });
            }}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor={`${ids}-tpd`}>Tokens a day</label>
          <input
            id={`${ids}-tpd`}
            type="number"
            min={1}
            inputMode="numeric"
            value={draft.limits.tokensPerDay ?? ''}
            onChange={(e) => {
              patch({ limits: { ...draft.limits, tokensPerDay: limitOf(e.target.value) } });
            }}
          />
        </div>
      </fieldset>
      <label className={styles.opt}>
        <input
          type="checkbox"
          checked={draft.fallback}
          onChange={(e) => {
            patch({ fallback: e.target.checked });
          }}
        />
        Use as fallback: auto-switch may send questions here when an earlier model is out
      </label>
      <p className={styles.status} role="status" aria-live="polite">
        {status}
      </p>
      <div className={styles.foot}>
        <Button onClick={() => void test()} disabled={testing}>
          Test
        </Button>
        <Button
          onClick={() => {
            if (!original) forgetUsage(draft.id);
            onDone();
          }}
        >
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          Save
        </Button>
      </div>
    </form>
  );
}
