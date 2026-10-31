import { Eye, EyeOff } from 'lucide-react';
import { useId, useState } from 'react';

import { Button } from '../../shared/ui/Button.tsx';
import type { AiSettings } from './aiSettings.ts';
import { providerFor } from './providers.ts';
import styles from './settings.module.css';

export interface ProviderFieldsProps {
  draft: AiSettings;
  onChange: (patch: Partial<AiSettings>) => void;
}

const host = (url: string) => url.replace(/^https?:\/\//, '');

/** The fields of the chosen provider: endpoint URL, key, model and the provider's own hints. */
export function ProviderFields({ draft, onChange }: ProviderFieldsProps) {
  const p = providerFor(draft.provider);
  const ids = useId();
  const [showKey, setShowKey] = useState(false);
  const key = draft.keys[p.id] ?? '';
  const model = draft.models[p.id] ?? p.model;

  const setKey = (value: string) => {
    const { [p.id]: _previous, ...others } = draft.keys;
    onChange({ keys: value ? { ...others, [p.id]: value } : others });
  };
  const setModel = (value: string) => {
    onChange({ models: { ...draft.models, [p.id]: value } });
  };

  return (
    <div className={styles.fields}>
      {p.artifact ? (
        <p className={styles.muted}>
          Works only when this page is opened as a Claude artifact; the viewer asks the person for consent on the
          first question.
        </p>
      ) : null}
      {p.id === 'custom' ? (
        <div className={styles.field}>
          <label htmlFor={`${ids}-url`}>Endpoint URL</label>
          <input
            id={`${ids}-url`}
            type="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://your-proxy.example/v1/chat/completions"
            value={draft.customUrl}
            onChange={(e) => onChange({ customUrl: e.target.value })}
          />
        </div>
      ) : null}
      {p.key === 'none' ? null : (
        <>
          <div className={styles.field}>
            <label htmlFor={`${ids}-key`}>API key</label>
            <div className={styles.keyRow}>
              <input
                id={`${ids}-key`}
                type={showKey ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                placeholder={p.key === 'optional' ? 'Optional' : 'Paste the key'}
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
              <Button
                icon
                aria-label={showKey ? 'Hide the key' : 'Show the key'}
                aria-pressed={showKey}
                title={showKey ? 'Hide the key' : 'Show the key'}
                onClick={() => setShowKey((v) => !v)}
              >
                {showKey ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </Button>
            </div>
          </div>
          {p.keyPage ? (
            <p className={styles.muted}>
              Get a key at{' '}
              <a href={p.keyPage} target="_blank" rel="noopener noreferrer">
                {host(p.keyPage)}
              </a>
              .
            </p>
          ) : null}
        </>
      )}
      {p.artifact ? null : (
        <div className={styles.field}>
          <label htmlFor={`${ids}-model`}>Model</label>
          <input
            id={`${ids}-model`}
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder={p.model || 'model name'}
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
        </div>
      )}
      {p.id === 'ollama' ? (
        <p className={styles.muted}>
          Start Ollama with <code className="mono">OLLAMA_ORIGINS=*</code> so this page may call it, and pull a model
          first (<code className="mono">ollama pull llama3.2</code>).
        </p>
      ) : null}
    </div>
  );
}
