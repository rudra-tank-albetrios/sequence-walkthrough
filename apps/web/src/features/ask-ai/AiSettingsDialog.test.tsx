import { clearAnswerCache, loadModelState, type ModelEntry } from '@swv/ai';
import { mockFetch, readStored, seedModels } from '@swv/ai/testing';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useFlowStore } from '../../shared/state/flowStore.ts';
import { Store } from '../../shared/storage/store.ts';
import { useAiSettingsStore } from './aiSettings.ts';
import { AiSettingsDialog } from './AiSettingsDialog.tsx';
import { refreshAiStore } from './aiStore.ts';

const user = userEvent.setup({ pointerEventsCheck: 0 });

let restore: (() => void) | undefined;

const open = () => {
  useFlowStore.getState().setUi({ aiSettingsOpen: true });
  render(<AiSettingsDialog />);
};

const names = () => loadModelState().models.map((m) => m.name);
const saved = (name: string): ModelEntry | undefined => loadModelState().models.find((m) => m.name === name);
const rowOf = (name: string) => {
  const row = screen.getAllByTestId('model-row').find((r) => within(r).queryByText(name));
  if (!row) throw new Error(`no row for ${name}`);
  return row;
};
const form = (name: string | RegExp) => screen.getByRole('form', { name });

async function fillNewKey(key: string) {
  await user.type(screen.getByLabelText('API key'), key);
}

beforeEach(async () => {
  for (const key of Store.keys('swv:')) Store.del(key);
  sessionStorage.clear();
  await clearAnswerCache();
  refreshAiStore();
  useAiSettingsStore.getState().reload();
});

afterEach(() => {
  restore?.();
  restore = undefined;
  useFlowStore.getState().setUi({ aiSettingsOpen: false });
});

describe('adding a model', () => {
  it('opens on the form when there is none yet, and says where keys live', () => {
    open();
    expect(screen.getByRole('dialog', { name: 'AI settings' })).toBeInTheDocument();
    expect(screen.getByText(/stored in this browser, not encrypted/)).toBeInTheDocument();
    expect(form('Add a model')).toBeInTheDocument();
    expect(screen.getByLabelText('Provider')).toHaveValue('groq');
    expect(screen.getByLabelText('Model')).toHaveValue('llama-3.3-70b-versatile');
    expect(screen.getByLabelText('API key')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('link', { name: 'console.groq.com/keys' })).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('saves the entry with its key, active, not a fallback', async () => {
    open();
    await fillNewKey('groq-key');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const entry = saved('Groq');
    expect(entry).toMatchObject({ preset: 'groq', key: 'groq-key', fallback: false });
    expect(loadModelState().activeId).toBe(entry?.id);
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(within(rowOf('Groq')).getByTestId('usage-bar')).toBeInTheDocument();
  });

  it('starts a new provider with its own name and model, and asks a fallback to be chosen', async () => {
    open();
    await user.selectOptions(screen.getByLabelText('Provider'), 'gemini');
    expect(screen.getByLabelText('Name')).toHaveValue('Gemini');
    expect(screen.getByLabelText('Model')).toHaveValue('gemini-2.5-flash');
    await fillNewKey('gem-key');
    await user.click(screen.getByRole('checkbox', { name: /Use as fallback/ }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(saved('Gemini')).toMatchObject({ preset: 'gemini', key: 'gem-key', fallback: true });
  });

  it('does not carry a typed key over to another provider', async () => {
    open();
    await fillNewKey('groq-key');
    await user.selectOptions(screen.getByLabelText('Provider'), 'gemini');
    expect(screen.getByLabelText('API key')).toHaveValue('');
    expect(screen.getByText(/The address changed, so the key was removed/)).toBeInTheDocument();
  });

  it('keeps optional limits as numbers', async () => {
    open();
    await fillNewKey('k');
    await user.type(screen.getByLabelText('Requests a day'), '1000');
    await user.type(screen.getByLabelText('Tokens a day'), '50000');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(saved('Groq')?.limits).toEqual({ requestsPerDay: 1000, tokensPerDay: 50000 });
  });

  it('accepts a local http link and a custom https one, and refuses plain http elsewhere', async () => {
    open();
    await user.selectOptions(screen.getByLabelText('Provider'), 'custom');
    const link = screen.getByLabelText('Model link');
    await user.type(screen.getByLabelText('Model'), 'my-model');
    await user.type(link, 'http://evil.example/v1');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText(/must start with https:\/\//)).toBeInTheDocument();
    expect(names()).toEqual([]);

    await user.clear(link);
    await user.type(link, 'http://localhost:8080/v1/chat/completions');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(saved('My model')?.url).toBe('http://localhost:8080/v1/chat/completions');
  });

  it('refuses a key inside the link', async () => {
    open();
    await user.selectOptions(screen.getByLabelText('Provider'), 'custom');
    await user.type(screen.getByLabelText('Model'), 'my-model');
    await user.type(screen.getByLabelText('Model link'), 'https://proxy.example/v1?api_key=secret');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Put the key in the API key field, not in the link.')).toBeInTheDocument();
    expect(names()).toEqual([]);
  });

  it('asks for a name and a model name', async () => {
    open();
    await user.clear(screen.getByLabelText('Name'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Give the model a name.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Name'), 'Mine');
    await user.clear(screen.getByLabelText('Model'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Add the model name.')).toBeInTheDocument();
    expect(names()).toEqual([]);
  });

  it('stores nothing on Cancel', async () => {
    open();
    await fillNewKey('groq-key');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(names()).toEqual([]);
    expect(localStorage.getItem('swv:ai:models') ?? '').not.toContain('groq-key');
    expect(screen.getByRole('button', { name: 'Add a model' })).toBeInTheDocument();
  });

  it('tests a draft with its own key, says how it went, and stores nothing', async () => {
    const mock = mockFetch({ reply: 'OK' });
    restore = mock.restore;
    open();
    await fillNewKey('draft-key');
    await user.click(screen.getByRole('button', { name: 'Test' }));
    await screen.findByText(/Works\. Groq said: OK\./);
    expect(mock.calls[0]?.authorization).toBe('Bearer draft-key');
    expect(mock.calls[0]?.url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(names()).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(readStored('swv:ai:usage')).toEqual({});
  });
});

describe('the model list', () => {
  it('tests one entry with its own key and only at its own address', async () => {
    seedModels({ preset: 'groq', key: 'groq-key' }, { preset: 'gemini', key: 'gem-key' });
    const mock = mockFetch({ reply: 'OK' });
    restore = mock.restore;
    open();
    await user.click(screen.getByRole('button', { name: 'Test Gemini' }));
    await within(rowOf('Gemini')).findByText(/Works\. Gemini said: OK\./);
    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0]?.url).toContain('generativelanguage.googleapis.com');
    expect(mock.calls[0]?.authorization).toBe('Bearer gem-key');
  });

  it('explains a call the browser blocked', async () => {
    seedModels({ preset: 'groq' });
    const original = globalThis.fetch;
    globalThis.fetch = (_url, init) =>
      init?.mode === 'no-cors' ? Promise.resolve(new Response(null)) : Promise.reject(new TypeError('Failed to fetch'));
    restore = () => {
      globalThis.fetch = original;
    };
    open();
    await user.click(screen.getByRole('button', { name: 'Test Groq' }));
    await within(rowOf('Groq')).findByText(/Your browser blocked the reply from api\.groq\.com/);
  });

  it('edits an entry in place and keeps its key', async () => {
    seedModels({ preset: 'groq', key: 'groq-key' });
    open();
    await user.click(screen.getByRole('button', { name: 'Edit Groq' }));
    const name = within(form('Edit Groq')).getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Fast one');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(saved('Fast one')).toMatchObject({ key: 'groq-key', preset: 'groq' });
    expect(names()).toEqual(['Fast one']);
  });

  it('drops the key when the address changes, so it can never reach the new one', async () => {
    seedModels({ preset: 'custom', name: 'Mine', model: 'm', url: 'https://a.example/v1', key: 'a-key' });
    const mock = mockFetch({ reply: 'OK' });
    restore = mock.restore;
    open();
    await user.click(screen.getByRole('button', { name: 'Edit Mine' }));
    const link = screen.getByLabelText('Model link');
    expect(screen.getByLabelText('API key')).toHaveValue('a-key');
    await user.clear(link);
    await user.type(link, 'https://b.example/v1');
    expect(screen.getByLabelText('API key')).toHaveValue('');
    expect(screen.getByText(/The address changed, so the key was removed/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Test' }));
    await screen.findByText(/Works\./);
    expect(mock.calls[0]?.url).toBe('https://b.example/v1');
    expect(mock.calls[0]?.authorization).toBe('');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(saved('Mine')).toMatchObject({ url: 'https://b.example/v1', key: '' });
  });

  it('reorders, and the ends of the list cannot move further', async () => {
    seedModels({ preset: 'groq' }, { preset: 'gemini' }, { preset: 'mistral' });
    open();
    expect(screen.getByRole('button', { name: 'Move Groq up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Mistral down' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Move Mistral up' }));
    expect(names()).toEqual(['Groq', 'Mistral', 'Gemini']);
    await user.click(screen.getByRole('button', { name: 'Move Groq down' }));
    expect(names()).toEqual(['Mistral', 'Groq', 'Gemini']);
    expect(loadModelState().models.find((m) => m.id === loadModelState().activeId)?.name).toBe('Groq');
  });

  it('deletes in two steps, with the key and its usage', async () => {
    seedModels({ preset: 'groq', key: 'groq-key' }, { preset: 'gemini' });
    open();
    await user.click(screen.getByRole('button', { name: 'Delete Groq' }));
    expect(names()).toEqual(['Groq', 'Gemini']);
    await user.click(screen.getByRole('button', { name: 'Confirm deleting Groq' }));
    expect(names()).toEqual(['Gemini']);
    expect(localStorage.getItem('swv:ai:models') ?? '').not.toContain('groq-key');
    expect(loadModelState().models.find((m) => m.id === loadModelState().activeId)?.name).toBe('Gemini');
  });

  it('takes back a delete when focus moves on', async () => {
    seedModels({ preset: 'groq' });
    open();
    await user.click(screen.getByRole('button', { name: 'Delete Groq' }));
    await user.tab();
    expect(screen.getByRole('button', { name: 'Delete Groq' })).toBeInTheDocument();
    expect(names()).toEqual(['Groq']);
  });

  it('marks fallbacks only when asked, and chooses who is asked first', async () => {
    seedModels({ preset: 'groq' }, { preset: 'gemini' });
    open();
    expect(saved('Gemini')?.fallback).toBe(false);
    await user.click(within(rowOf('Gemini')).getByRole('checkbox', { name: 'Use as fallback' }));
    expect(saved('Gemini')?.fallback).toBe(true);
    expect(saved('Groq')?.fallback).toBe(false);
    await user.click(within(rowOf('Gemini')).getByRole('radio'));
    expect(loadModelState().activeId).toBe(saved('Gemini')?.id);
  });

  it('says what an entry still needs', () => {
    seedModels({ preset: 'groq', key: '' });
    open();
    expect(within(rowOf('Groq')).getByText('Add the API key for Groq.')).toBeInTheDocument();
  });

  it('loads keys version 2 saved, with nothing marked as a fallback', () => {
    localStorage.setItem(
      'swv:ai',
      JSON.stringify({
        provider: 'gemini',
        keys: { gemini: 'old-gemini', groq: 'old-groq' },
        models: { gemini: 'gemini-old' },
        customUrl: '',
        includePayload: false,
        autoNote: true,
        mode: 'general',
      }),
    );
    refreshAiStore();
    open();
    expect(names()).toEqual(['Gemini', 'Groq']);
    expect(saved('Gemini')).toMatchObject({ key: 'old-gemini', model: 'gemini-old', fallback: false });
    expect(saved('Groq')).toMatchObject({ key: 'old-groq', fallback: false });
    expect(screen.getAllByTestId('model-row')).toHaveLength(2);
    expect(JSON.parse(localStorage.getItem('swv:ai') ?? '{}')).toEqual({
      includePayload: false,
      autoNote: true,
      mode: 'general',
    });
  });
});

describe('the options', () => {
  it('edits the switch level, within 0 to 100', async () => {
    open();
    const level = screen.getByLabelText('Switch at');
    expect(level).toHaveValue(5);
    await user.clear(level);
    await user.type(level, '250');
    expect(loadModelState().switchAt).toBe(100);
    await user.clear(level);
    await user.type(level, '20');
    expect(loadModelState().switchAt).toBe(20);
  });

  it('forgets keys with the tab: out of localStorage, still usable here, and says the limit of it', async () => {
    seedModels({ preset: 'groq', key: 'groq-key' });
    open();
    expect(screen.getByText(/A browser that restores closed tabs may bring it back/)).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /Forget key when this tab closes/ }));
    expect(localStorage.getItem('swv:ai:models') ?? '').not.toContain('groq-key');
    expect(saved('Groq')?.key).toBe('groq-key');

    sessionStorage.clear();
    expect(saved('Groq')?.key).toBe('');
    await waitFor(() => {
      expect(loadModelState().forgetKeys).toBe(true);
    });
  });

  it('keeps the two Ask AI options under their version 2 names', async () => {
    open();
    await user.click(screen.getByRole('checkbox', { name: /Include the step's payload/ }));
    await user.click(screen.getByRole('checkbox', { name: /Save every answer/ }));
    expect(readStored('swv:ai')).toMatchObject({ includePayload: false, autoNote: false });
  });

  it('shows how many answers are saved, and clears them', async () => {
    localStorage.setItem('swv:ai:cache', JSON.stringify({ abc: { a: 'An old answer.', t: 1 } }));
    open();
    const row = await screen.findByTestId('saved-answers');
    await within(row).findByText(/1 saved answer, about \d+ bytes/);
    await user.click(within(row).getByRole('button', { name: 'Clear saved answers' }));
    await within(row).findByText(/0 saved answers/);
    expect(localStorage.getItem('swv:ai:cache')).toBeNull();
    expect(within(row).getByRole('button', { name: 'Clear saved answers' })).toBeDisabled();
  });
});

describe('the privacy notice', () => {
  it('names every model that could receive text, and is gone once accepted', async () => {
    seedModels({ preset: 'groq' }, { preset: 'gemini', fallback: true }, { preset: 'mistral' });
    localStorage.removeItem('swv:ai:consent');
    open();
    const notice = screen.getByTestId('privacy-notice');
    expect(within(notice).getByText(/Groq \(api\.groq\.com\)/)).toBeInTheDocument();
    expect(within(notice).getByText(/Gemini \(generativelanguage\.googleapis\.com\)/)).toBeInTheDocument();
    expect(within(notice).queryByText(/Mistral/)).not.toBeInTheDocument();
    await user.click(within(notice).getByRole('button', { name: 'I understand, continue' }));
    expect(screen.queryByTestId('privacy-notice')).not.toBeInTheDocument();
    expect(readStored('swv:ai:consent')).toEqual(['api.groq.com', 'generativelanguage.googleapis.com']);
  });

  it('comes back for a model on a new host', async () => {
    seedModels({ preset: 'groq' });
    open();
    expect(screen.queryByTestId('privacy-notice')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add a model' }));
    await user.selectOptions(screen.getByLabelText('Provider'), 'gemini');
    await fillNewKey('gem-key');
    await user.click(within(form('Add a model')).getByRole('checkbox', { name: /Use as fallback/ }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByTestId('privacy-notice')).toBeInTheDocument();
  });

  it('is not needed before a model is set up', () => {
    open();
    expect(screen.queryByTestId('privacy-notice')).not.toBeInTheDocument();
  });
});
