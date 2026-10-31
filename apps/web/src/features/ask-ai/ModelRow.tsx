import { modelHost, modelProblem, testModel, type ModelEntry } from '@swv/ai';
import { useState } from 'react';

import { Button } from '../../shared/ui/Button.tsx';
import { deleteModel, moveModel, setActiveModel, setFallback, useAiStore } from './aiStore.ts';
import styles from './settings.module.css';
import { UsageBar } from './UsageBars.tsx';

export interface ModelRowProps {
  model: ModelEntry;
  /** Its place in the list, which decides who is next. */
  index: number;
  count: number;
  onEdit: () => void;
}

/** One saved model: first choice, fallback, usage, test, edit, reorder and delete. */
export function ModelRow({ model, index, count, onEdit }: ModelRowProps) {
  const active = useAiStore((s) => s.state.activeId === model.id);
  const record = useAiStore((s) => s.usage[model.id]);
  const [status, setStatus] = useState('');
  const [testing, setTesting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const problem = modelProblem(model);

  const test = async () => {
    setTesting(true);
    setStatus('Testing…');
    const check = await testModel(model);
    setStatus(check.message);
    setTesting(false);
  };

  return (
    <li className={styles.row} data-testid="model-row">
      <div className={styles.rowHead}>
        <label className={styles.first}>
          <input
            type="radio"
            name="ai-first-model"
            checked={active}
            onChange={() => {
              setActiveModel(model.id);
            }}
          />
          <span className={styles.name}>{model.name}</span>
          {active ? <span className={styles.muted}>asked first</span> : null}
        </label>
        <span className={`${styles.model} mono`}>
          {modelHost(model)}
          {model.model ? ` · ${model.model}` : ''}
        </span>
      </div>
      <UsageBar model={model} record={record} hideName />
      {problem ? <p className={styles.warn}>{problem}</p> : null}
      <div className={styles.rowActions}>
        <label className={styles.opt}>
          <input
            type="checkbox"
            checked={model.fallback}
            onChange={(e) => {
              setFallback(model.id, e.target.checked);
            }}
          />
          Use as fallback
        </label>
        <span className={styles.rowButtons}>
          <Button onClick={() => void test()} disabled={testing} aria-label={`Test ${model.name}`}>
            Test
          </Button>
          <Button onClick={onEdit} aria-label={`Edit ${model.name}`}>
            Edit
          </Button>
          <Button
            icon
            disabled={index === 0}
            aria-label={`Move ${model.name} up`}
            title="Move up"
            onClick={() => {
              moveModel(model.id, -1);
            }}
          >
            ↑
          </Button>
          <Button
            icon
            disabled={index === count - 1}
            aria-label={`Move ${model.name} down`}
            title="Move down"
            onClick={() => {
              moveModel(model.id, 1);
            }}
          >
            ↓
          </Button>
          {confirming ? (
            <Button
              aria-label={`Confirm deleting ${model.name}`}
              onBlur={() => {
                setConfirming(false);
              }}
              onClick={() => {
                deleteModel(model.id);
              }}
            >
              Delete, with its key
            </Button>
          ) : (
            <Button
              aria-label={`Delete ${model.name}`}
              onClick={() => {
                setConfirming(true);
              }}
            >
              Delete
            </Button>
          )}
        </span>
      </div>
      <p className={styles.status} role="status" aria-live="polite">
        {status}
      </p>
    </li>
  );
}
