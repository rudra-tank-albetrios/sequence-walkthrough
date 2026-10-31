import type { Step } from '@swv/core';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useFlowStore } from '../../shared/state/flowStore.ts';
import { useGlossaryStore } from '../../shared/state/glossaryStore.ts';
import { useNotesStore } from '../../shared/state/notesStore.ts';
import { flowId } from '../../shared/storage/notes.ts';
import { Store } from '../../shared/storage/store.ts';
import { DEFAULT_AI_SETTINGS, useAiSettingsStore } from './aiSettings.ts';
import { AskDialog } from './AskDialog.tsx';

const CODE = `sequenceDiagram
  %% @title Test flow
  %% @term hold: a short-lived Redis key that keeps stock aside.
  %% @layer A kind=client The client page.
  %% @layer B kind=service The service that holds stock.
  %% @step The client asks the service to hold the stock.
  A->>B: POST /hold
  %% @step The service confirms the hold.
  B-->>A: 201 Created`;

const answerWith = (content: string) =>
  vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );

function openOnStep1(): Step {
  const flow = useFlowStore.getState();
  flow.setCode(CODE);
  const parsed = useFlowStore.getState().flow;
  const step = parsed?.steps[0];
  if (!parsed || !step) throw new Error('the test flow did not parse');
  useNotesStore.setState({ id: '', data: {} });
  useNotesStore.getState().load(parsed);
  useGlossaryStore.setState({ id: '', saved: {} });
  useGlossaryStore.getState().load(flowId(parsed));
  flow.go(0);
  flow.setUi({ askOpen: true });
  return step;
}

const user = userEvent.setup({ pointerEventsCheck: 0 });

beforeEach(() => {
  for (const key of Store.keys('swv:')) Store.del(key);
  useAiSettingsStore.getState().replace({ ...DEFAULT_AI_SETTINGS, keys: { groq: 'gsk_test' } });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useFlowStore.getState().setUi({ askOpen: false, aiSettingsOpen: false });
});

describe('AskDialog', () => {
  it('opens on the current step with the fixed chips and a term chip', () => {
    openOnStep1();
    render(<AskDialog />);
    expect(screen.getByRole('dialog', { name: 'Ask AI about step 1' })).toBeInTheDocument();
    for (const chip of ['Explain simpler', 'Why this step?', 'What if it fails?', 'What is hold?']) {
      expect(screen.getByRole('button', { name: chip })).toBeInTheDocument();
    }
    expect(screen.getByRole('textbox', { name: 'Question' })).toHaveFocus();
  });

  it('appends the answer to the step note in the version 2 format', async () => {
    vi.stubGlobal('fetch', answerWith('The client reserves stock first.'));
    const step = openOnStep1();
    useNotesStore.getState().setNote(step, 'My own note');
    render(<AskDialog />);
    await user.type(screen.getByRole('textbox', { name: 'Question' }), 'Why this step?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    await screen.findByText('The client reserves stock first.');
    expect(screen.getByText('Groq · llama-3.3-70b-versatile')).toBeInTheDocument();
    expect(screen.getByText(/Saved to this step's note/)).toBeInTheDocument();
    expect(useNotesStore.getState().entry(step)?.note).toBe(
      'My own note\n\nQ: Why this step?\nA: The client reserves stock first.',
    );
  });

  it('labels a cached answer and sends again on Ask again', async () => {
    const fetchMock = answerWith('Because.');
    vi.stubGlobal('fetch', fetchMock);
    openOnStep1();
    render(<AskDialog />);
    await user.click(screen.getByRole('button', { name: 'Why this step?' }));
    await screen.findByText('Because.');
    expect(screen.queryByText('Saved answer')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Explain simpler' }));
    await within(screen.getByTestId('ask-answer')).findByText('Explain simpler');
    await user.click(screen.getByRole('button', { name: 'Why this step?' }));
    await screen.findByText('Saved answer');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole('button', { name: 'Ask again' }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });

  it('offers Add to glossary for a What is question and saves the answer as the definition', async () => {
    vi.stubGlobal('fetch', answerWith('A reservation of stock.'));
    openOnStep1();
    render(<AskDialog />);
    await user.click(screen.getByRole('button', { name: 'What is hold?' }));
    await screen.findByText('A reservation of stock.');
    await user.click(screen.getByRole('button', { name: 'Add to glossary' }));
    expect(useGlossaryStore.getState().saved.hold).toMatchObject({ term: 'hold', def: 'A reservation of stock.' });
  });

  it('shows plain error text from the provider, never as markup', async () => {
    vi.stubGlobal('fetch', answerWith('<b>bold</b> <img src=x onerror=alert(1)>'));
    openOnStep1();
    render(<AskDialog />);
    await user.click(screen.getByRole('button', { name: 'Why this step?' }));
    const answer = await screen.findByText('<b>bold</b> <img src=x onerror=alert(1)>');
    expect(answer.querySelector('b, img')).toBeNull();
  });

  it('without a key points to the settings dialog instead of sending', async () => {
    const fetchMock = answerWith('never');
    vi.stubGlobal('fetch', fetchMock);
    useAiSettingsStore.getState().replace({ ...DEFAULT_AI_SETTINGS });
    openOnStep1();
    render(<AskDialog />);
    expect(screen.getByText(/No AI provider set up yet/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Choose a free provider and add its key' }));
    expect(useFlowStore.getState().ui.aiSettingsOpen).toBe(true);
    useFlowStore.getState().setUi({ aiSettingsOpen: false });
    await user.click(screen.getByRole('button', { name: 'Why this step?' }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useFlowStore.getState().ui.aiSettingsOpen).toBe(true);
  });

  it('sends a question another feature prepared and clears it', async () => {
    vi.stubGlobal('fetch', answerWith('A hold keeps stock aside.'));
    openOnStep1();
    useFlowStore.getState().setUi({ askQuestion: 'What is "hold" here?' });
    render(<AskDialog />);
    await screen.findByText('A hold keeps stock aside.');
    expect(useFlowStore.getState().ui.askQuestion).toBeNull();
    expect(screen.getByRole('button', { name: 'Add to glossary' })).toBeInTheDocument();
  });
});
