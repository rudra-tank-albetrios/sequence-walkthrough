import {
  answerCacheInfo,
  clearAnswerCache,
  consentMissing,
  grantConsent,
  onAiChange,
  receivingModels,
  type AnswerCacheInfo,
} from '@swv/ai';
import { useEffect, useId, useState } from 'react';

import { plural } from '../../shared/lib/util.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { Button } from '../../shared/ui/Button.tsx';
import { Dialog } from '../../shared/ui/Dialog.tsx';
import { toast } from '../../shared/ui/toast.ts';
import { useAiSettingsStore } from './aiSettings.ts';
import { setForgetKeys, setSwitchAt, useAiStore } from './aiStore.ts';
import { ModelForm } from './ModelForm.tsx';
import { ModelRow } from './ModelRow.tsx';
import { PrivacyNotice } from './PrivacyNotice.tsx';
import styles from './settings.module.css';

const INTRO =
  "Short answers, quizzes and recaps from models you choose. Your keys are stored in this browser, not encrypted, and each key is sent only to its own model's address. Check each provider's current free tier before relying on it.";

/** The model list and how they are used. Opens from the panel's ⚙, the menus and Export. */
export function AiSettingsDialog() {
  const open = useFlowStore((s) => s.ui.aiSettingsOpen);
  const setUi = useFlowStore((s) => s.setUi);
  const close = () => {
    setUi({ aiSettingsOpen: false });
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title="AI settings"
      description={INTRO}
      showDescription
      actions={<Button onClick={close}>Done</Button>}
    >
      {open ? <SettingsBody /> : null}
    </Dialog>
  );
}

/** `editing`: the id of the entry in the form, `new` for a new one, null for none. */
function SettingsBody() {
  const state = useAiStore((s) => s.state);
  const [editing, setEditing] = useState<string | null>(state.models.length ? null : 'new');
  const receiving = receivingModels(state);
  const done = () => {
    setEditing(null);
  };

  return (
    <div>
      {consentMissing(receiving).length ? (
        <PrivacyNotice
          models={receiving}
          onAccept={() => {
            grantConsent(receiving);
          }}
        />
      ) : null}
      {state.models.length ? (
        <ol className={styles.rows} aria-label="Your models, in the order they are tried">
          {state.models.map((model, index) =>
            editing === model.id ? (
              <li key={model.id}>
                <ModelForm original={model} onDone={done} />
              </li>
            ) : (
              <ModelRow
                key={model.id}
                model={model}
                index={index}
                count={state.models.length}
                onEdit={() => {
                  setEditing(model.id);
                }}
              />
            ),
          )}
        </ol>
      ) : null}
      {editing === 'new' ? (
        <ModelForm original={null} onDone={done} />
      ) : (
        <Button
          onClick={() => {
            setEditing('new');
          }}
        >
          Add a model
        </Button>
      )}
      <Options switchAt={state.switchAt} forgetKeys={state.forgetKeys} />
      <SavedAnswers />
    </div>
  );
}

function Options({ switchAt, forgetKeys }: { switchAt: number; forgetKeys: boolean }) {
  const settings = useAiSettingsStore((s) => s.settings);
  const update = useAiSettingsStore((s) => s.update);
  const ids = useId();
  return (
    <div className={styles.options}>
      <div className={styles.field}>
        <label htmlFor={`${ids}-switch`}>Switch at</label>
        <input
          id={`${ids}-switch`}
          className={styles.percent}
          type="number"
          min={0}
          max={100}
          inputMode="numeric"
          value={switchAt}
          onChange={(e) => {
            const value = Number(e.target.value);
            if (Number.isFinite(value)) setSwitchAt(Math.min(100, Math.max(0, value)));
          }}
        />
        <span>% left: the next question goes to the next model marked as a fallback.</span>
      </div>
      <label className={styles.opt}>
        <input
          type="checkbox"
          checked={forgetKeys}
          onChange={(e) => {
            setForgetKeys(e.target.checked);
          }}
        />
        <span>
          Forget key when this tab closes. The key stays in this tab only. A browser that restores closed tabs may bring
          it back.
        </span>
      </label>
      <label className={styles.opt}>
        <input
          type="checkbox"
          checked={settings.includePayload}
          onChange={(e) => {
            update({ includePayload: e.target.checked });
          }}
        />
        Include the step&apos;s payload in the question (project mode)
      </label>
      <label className={styles.opt}>
        <input
          type="checkbox"
          checked={settings.autoNote}
          onChange={(e) => {
            update({ autoNote: e.target.checked });
          }}
        />
        Save every answer to the step&apos;s note, so it can be edited later
      </label>
    </div>
  );
}

const sizeText = (bytes: number): string =>
  bytes < 1024 ? `${bytes} bytes` : `${(bytes / 1024).toFixed(bytes < 10_240 ? 1 : 0)} KB`;

/** How many answers are kept in this browser, and the button that clears them. */
function SavedAnswers() {
  const [info, setInfo] = useState<AnswerCacheInfo | null>(null);
  useEffect(() => {
    let live = true;
    const read = () => {
      void answerCacheInfo().then((next) => {
        if (live) setInfo(next);
      });
    };
    read();
    const stop = onAiChange(read);
    return () => {
      live = false;
      stop();
    };
  }, []);
  if (!info) return null;
  return (
    <p className={styles.saved} data-testid="saved-answers">
      <span>
        {plural(info.count, 'saved answer')}
        {info.count ? `, about ${sizeText(info.bytes)}` : ''}. A repeated question costs no tokens.
      </span>
      <Button
        disabled={info.count === 0}
        onClick={() => {
          void clearAnswerCache().then(() => {
            toast('Saved answers cleared');
          });
        }}
      >
        Clear saved answers
      </Button>
    </p>
  );
}
