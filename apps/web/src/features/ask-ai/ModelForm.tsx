import {
  applyEdit,
  chooseModel,
  detectModelLink,
  endpointUrl,
  forgetUsage,
  listModelNames,
  modelProblem,
  newModel,
  presetFor,
  PRESETS,
  testModel,
  urlProblem,
  type ModelEntry,
  type PresetId,
} from '@swv/ai';
import { Eye, EyeOff } from 'lucide-react';
import { useId, useRef, useState } from 'react';

import { Button } from '../../shared/ui/Button.tsx';
import { Select } from '../../shared/ui/Select.tsx';
import { toast } from '../../shared/ui/toast.ts';
import { saveModel } from './aiStore.ts';
import styles from './settings.module.css';

const hostOf = (url: string): string => url.replace(/^https?:\/\//, '');

/** The host a draft's key would go to, or an empty string while the address is not valid. */
function keyHost(entry: ModelEntry): string {
  try {
    return new URL(endpointUrl(entry)).host;
  } catch {
    return '';
  }
}

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

/** Adds or edits one model: provider, key, model, then Save. Nothing is stored until Save. */
export function ModelForm({ original, onDone }: ModelFormProps) {
  const [draft, setDraft] = useState<ModelEntry>(() => original ?? newModel('groq'));
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState('');
  const [testing, setTesting] = useState(false);
  const [link, setLink] = useState('');
  const [modelNames, setModelNames] = useState<string[]>([]);
  const detected = useRef('');
  const ids = useId();
  const preset = presetFor(draft.preset);
  const host = keyHost(draft);
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
    setModelNames([]);
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

  /** Asks the entry's own server for its models. A model the link named is kept, even if not listed. */
  const findModels = async (entry: ModelEntry, intro: string, named: boolean) => {
    const names = await listModelNames(entry);
    setModelNames(names ?? []);
    if (!names || names.length === 0) {
      if (intro) setStatus(`${intro} ${entry.key ? 'It would not list its models, so check the model name.' : 'Add your key to list its models.'}`);
      return;
    }
    // Adding a key only fills the list, unless the starting model is not offered: it must not overwrite
    // a Test result or a name the person typed.
    const starting = !entry.model || entry.model === presetFor(entry.preset).model;
    if (!intro && (!starting || names.includes(entry.model))) return;
    const model = named ? entry.model : chooseModel(names, entry.model);
    setDraft((d) => (d.id === entry.id ? { ...d, model } : d));
    const listed = names.includes(model)
      ? `and ${model} is chosen.`
      : `but not ${model}, so check that name.`;
    setStatus(`${intro} It offers ${String(names.length)} models, ${listed}`.trim());
  };

  /** Fills in the provider, address and model from a pasted link. */
  const detect = (text: string) => {
    if (!text.trim() || text === detected.current) return;
    detected.current = text;
    const found = detectModelLink(text);
    if (!found.ok) {
      setStatus(found.message);
      return;
    }
    const old = presetFor(draft.preset);
    const next = applyEdit(draft, {
      ...draft,
      preset: found.preset,
      url: found.url,
      model: found.model || draft.model,
      name: !draft.name || draft.name === old.name ? found.name : draft.name,
    });
    setDraft(next);
    const intro = `Found ${found.name}${next.model ? `, model ${next.model}` : ''}. It uses OpenAI-style chat, and your key goes only to ${found.host}.`;
    setStatus(intro);
    void findModels(next, intro, found.named);
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

  const providerHint = () => {
    if (preset.artifact) return 'Works only when this page is opened as a Claude artifact. It needs no key.';
    if (draft.preset === 'ollama') {
      return (
        <>
          Start Ollama with <code className="mono">OLLAMA_ORIGINS=*</code> so this page may call it, and pull a
          model first (<code className="mono">ollama pull llama3.2</code>).
        </>
      );
    }
    if (draft.preset === 'custom') return 'Any server that speaks OpenAI-style chat: a proxy, a gateway or a local one.';
    if (preset.keyPage) {
      return (
        <>
          Get a free key at{' '}
          <a href={preset.keyPage} target="_blank" rel="noopener noreferrer">
            {hostOf(preset.keyPage)}
          </a>
          , then paste it below.
        </>
      );
    }
    return null;
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
      <h3 className={styles.formTitle}>{original ? `Edit ${original.name}` : 'New model'}</h3>
      <div className={styles.fields}>
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
          <p className={styles.hint}>{providerHint()}</p>
        </div>
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
        {preset.key === 'none' ? null : (
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
                onBlur={() => {
                  if (draft.key.trim() && !modelProblem(trimmed())) void findModels(trimmed(), '', false);
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
            <p className={styles.hint}>
              Kept in this browser only{host ? `, and sent only to ${host}` : ''}: to list its models
              when you add it, then for Test and your questions.
            </p>
          </div>
        )}
        {preset.artifact ? null : (
          <div className={styles.twoUp}>
            <div className={styles.field}>
              <label htmlFor={`${ids}-model`}>Model</label>
              <input
                id={`${ids}-model`}
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder={preset.model || 'model name'}
                list={`${ids}-models`}
                value={draft.model}
                onChange={(e) => {
                  patch({ model: e.target.value });
                }}
              />
              <datalist id={`${ids}-models`}>
                {modelNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              <p className={styles.hint}>
                {modelNames.length
                  ? `${String(modelNames.length)} models offered: pick one from the list or type a name.`
                  : 'A current model is filled in. Type another name if you prefer.'}
              </p>
            </div>
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
              <p className={styles.hint}>How it is shown in the list and the menus.</p>
            </div>
          </div>
        )}
        {preset.artifact ? (
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
        ) : null}
        <details className={styles.more}>
          <summary>Paste a link instead</summary>
          <div className={styles.moreBody}>
            <div className={styles.field}>
              <label htmlFor={`${ids}-link`}>API address or model page</label>
              <input
                id={`${ids}-link`}
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder="https://api.example.com/v1 or https://openrouter.ai/org/model"
                value={link}
                onChange={(e) => {
                  setLink(e.target.value);
                }}
                onPaste={(e) => {
                  detect(e.clipboardData.getData('text'));
                }}
                onBlur={() => {
                  detect(link);
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  detect(link);
                }}
              />
              <p className={styles.hint}>
                The provider, address and model are filled in from the link. It only reads the text and sends
                nothing.
              </p>
            </div>
          </div>
        </details>
        <details className={styles.more}>
          <summary>Daily limits and fallback</summary>
          <div className={styles.moreBody}>
            <fieldset className={styles.limits}>
              <legend>Your limits (optional)</legend>
              <p className={styles.hint}>
                Used for an estimate when the provider does not report its usage to browsers.
              </p>
              <div className={styles.twoUp}>
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
          </div>
        </details>
      </div>
      <p className={styles.status} role="status" aria-live="polite">
        {status}
      </p>
      <div className={styles.foot}>
        <Button className={styles.footLeft} onClick={() => void test()} disabled={testing}>
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
