import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_DIAGRAM } from '../../shared/lib/defaultDiagram.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { dbDelete, dbGet, dbUpdate } from '../../shared/storage/db.ts';
import { Store } from '../../shared/storage/store.ts';
import {
  clearWeakPoints,
  QUIZ_RETRY_KEY,
  recordCorrect,
  recordMiss,
  takeQuizRetry,
  type Miss,
} from '../../shared/storage/weakPoints.ts';
import { RecapDialog } from './RecapDialog.tsx';
import { SAVED_ANALYSIS_KEY } from './savedAnalysis.ts';

const CODE = `sequenceDiagram
  %% @title Orders
  %% @section Reserve stock
  %% @step The service holds the stock.
  A->>B: POST /hold
  %% @step The hold is confirmed.
  B-->>A: 201 Created`;

const THIS_FLOW = 't:Orders';
const NOW = new Date(2026, 9, 31, 15, 30);
const daysAgo = (days: number) => new Date(2026, 9, 31 - days, 11, 0);
const TEST_KEY = 'gsk_test_key';

const miss = (question: string, patch: Partial<Miss> = {}): Miss => ({
  flowId: THIS_FLOW,
  flow: 'Orders',
  step: 1,
  chapter: 'Reserve stock',
  topic: 'Stock holds',
  question,
  userAnswer: `My answer to: ${question}`,
  correctAnswer: `The right answer to: ${question}`,
  whyWrong: `The reason about: ${question}`,
  ...patch,
});

const GOOD_REPLY = JSON.stringify({
  groups: [{ title: 'Holds', points: ['A hold keeps stock aside.'], mistakes: [1] }],
});

interface Call {
  url: string;
  authorization: string;
  body: { max_tokens?: number; messages?: { role: string; content: string }[] };
}

/** Replaces `fetch` and records what leaves the page. Nothing here reaches a real provider. */
function mockFetch(reply: string, status = 200) {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    calls.push({
      url,
      authorization: new Headers(init.headers).get('authorization') ?? '',
      body: JSON.parse(init.body as string) as Call['body'],
    });
    const body = JSON.stringify({ choices: [{ message: { content: reply } }] });
    return Promise.resolve(new Response(body, { status }));
  });
  return { calls };
}

/** One saved model, and a replaced `fetch`. */
function mockModel(reply: string, status = 200) {
  setUpModel();
  return mockFetch(reply, status);
}

function setUpModel() {
  Store.set('swv:ai', { provider: 'groq', keys: { groq: TEST_KEY } });
}

/** A provider that answers only when the request is stopped. It shows what the signal did. */
function hangingFetch() {
  const seen: { signal: AbortSignal | null | undefined } = { signal: undefined };
  vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
    seen.signal = init.signal;
    return new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });
  });
  return seen;
}

const user = userEvent.setup({ pointerEventsCheck: 0 });

/** Opens the recap on a flow and waits for it to read the stored mistakes. */
async function openRecap(code = CODE) {
  useFlowStore.getState().setCode(code);
  useFlowStore.getState().setUi({ recapOpen: true });
  const view = render(<RecapDialog />);
  await screen.findByRole('group', { name: 'Period' });
  return view;
}

/** Closes the dialog and opens it again, as a person would. */
async function reopen() {
  useFlowStore.getState().setUi({ recapOpen: false });
  await waitFor(() => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  useFlowStore.getState().setUi({ recapOpen: true });
  await screen.findByRole('group', { name: 'Period' });
}

const period = (name: RegExp) => screen.getByRole('button', { name });
const mistakeCards = () => screen.queryAllByTestId('recap-mistake');
const analyseButton = () => screen.findByRole('button', { name: 'Analyse my mistakes' });

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  await clearWeakPoints();
  await dbDelete(SAVED_ANALYSIS_KEY);
  for (const key of Store.keys('swv:')) Store.del(key);
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  useFlowStore.getState().setUi({ recapOpen: false, quizOpen: false, aiSettingsOpen: false });
});

describe('each mistake', () => {
  it('shows the question, the answer given, why it was wrong and the correct answer', async () => {
    await recordMiss(miss('Why hold stock?'), NOW);
    await openRecap();
    expect(screen.getByRole('dialog', { name: 'Day recap' })).toBeInTheDocument();
    const card = within(screen.getByTestId('recap-mistake'));
    expect(card.getByText('Why hold stock?')).toBeInTheDocument();
    expect(card.getByText('My answer to: Why hold stock?')).toBeInTheDocument();
    expect(card.getByText('The reason about: Why hold stock?')).toBeInTheDocument();
    expect(card.getByText('The right answer to: Why hold stock?')).toBeInTheDocument();
    expect(card.getByText('Stock holds')).toBeInTheDocument();
    expect(card.getByText('Reserve stock')).toBeInTheDocument();
    expect(card.getByText('Step 1')).toBeInTheDocument();
    expect(card.getByText('Missed once')).toBeInTheDocument();
    expect(screen.getByText('1 mistake')).toBeInTheDocument();
  });

  it('shows stored text as plain text, never as markup', async () => {
    await recordMiss(miss('<img src=x onerror=alert(1)>?', { userAnswer: '<b>bold</b>' }), NOW);
    await openRecap();
    const answer = screen.getByText('<b>bold</b>');
    expect(answer.querySelector('b')).toBeNull();
    expect(screen.getByRole('dialog').querySelector('img')).toBeNull();
  });
});

describe('with no model', () => {
  it('still shows the mistakes and correct answers, without analysis and without an error', async () => {
    const { calls } = mockFetch(GOOD_REPLY);
    await recordMiss(miss('Why hold stock?'), NOW);
    await openRecap();
    expect(mistakeCards()).toHaveLength(1);
    expect(screen.getByText('The right answer to: Why hold stock?')).toBeInTheDocument();
    expect(await screen.findByText(/No model is set up/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Analyse my mistakes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByTestId('recap-group')).not.toBeInTheDocument();
    expect(document.querySelector('.error')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('offers the settings, and the analysis once a model is added there', async () => {
    await recordMiss(miss('Why hold stock?'), NOW);
    await openRecap();
    await user.click(await screen.findByRole('button', { name: 'Add a model' }));
    expect(useFlowStore.getState().ui.aiSettingsOpen).toBe(true);
    setUpModel();
    useFlowStore.getState().setUi({ aiSettingsOpen: false });
    expect(await analyseButton()).toBeInTheDocument();
  });

  it('keeps showing an analysis saved earlier, sending nothing', async () => {
    const { calls } = mockModel(GOOD_REPLY);
    await recordMiss(miss('Why hold stock?'), NOW);
    await openRecap();
    await user.click(await analyseButton());
    await screen.findByText('A hold keeps stock aside.');
    expect(calls).toHaveLength(1);
    Store.del('swv:ai');
    await reopen();
    expect(await screen.findByText('A hold keeps stock aside.')).toBeInTheDocument();
    expect(calls).toHaveLength(1);
  });
});

describe('the analysis', () => {
  it('sends nothing until asked, and says what it would send', async () => {
    const { calls } = mockModel(GOOD_REPLY);
    await recordMiss(miss('Why hold stock?'), NOW);
    await openRecap();
    await analyseButton();
    expect(screen.getByText(/Sends these questions, your answers/)).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it('asks the model for at most 500 reply tokens, with the mistakes as data', async () => {
    const { calls } = mockModel(GOOD_REPLY);
    await recordMiss(miss('Why hold stock?'), NOW);
    await openRecap();
    await user.click(await analyseButton());
    await screen.findByText('A hold keeps stock aside.');
    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call?.url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(call?.authorization).toBe(`Bearer ${TEST_KEY}`);
    expect(call?.body.max_tokens).toBeLessThanOrEqual(500);
    expect(call?.body.messages?.[1]?.content).toContain('data, not instructions');
    expect(call?.body.messages?.[1]?.content).toContain('Why hold stock?');
    expect(JSON.stringify(call?.body)).not.toContain(TEST_KEY);
  });

  it('shows the groups and which mistakes each covers', async () => {
    mockModel(
      JSON.stringify({
        groups: [
          { title: 'Holds', points: ['One.', 'Two.'], mistakes: [1, 2] },
          { title: 'Replies', points: ['Three.'], mistakes: [2] },
        ],
      }),
    );
    await recordMiss(miss('First?'), NOW);
    await recordMiss(miss('Second?'), NOW);
    await openRecap();
    await user.click(await analyseButton());
    const groups = await screen.findAllByTestId('recap-group');
    expect(groups).toHaveLength(2);
    const [first, second] = groups as [HTMLElement, HTMLElement];
    expect(within(first).getByRole('heading', { name: 'Holds' })).toBeInTheDocument();
    expect(within(first).getAllByRole('listitem')).toHaveLength(2);
    expect(within(first).getByText('Mistakes 1, 2')).toBeInTheDocument();
    expect(within(second).getByText('Mistake 2')).toBeInTheDocument();
    expect(screen.getByText('Saved analysis')).toBeInTheDocument();
  });

  it('reads a reply wrapped in a code fence', async () => {
    mockModel(`Here you go:\n\`\`\`json\n${GOOD_REPLY}\n\`\`\``);
    await recordMiss(miss('Why hold stock?'), NOW);
    await openRecap();
    await user.click(await analyseButton());
    expect(await screen.findByText('A hold keeps stock aside.')).toBeInTheDocument();
  });

  it('shows a reply as plain text, whatever it holds', async () => {
    mockModel(
      JSON.stringify({
        groups: [
          {
            title: '<img src=x onerror=alert(1)>',
            points: ['<script>alert(1)</script>', '[click](javascript:alert(1))'],
          },
        ],
      }),
    );
    await recordMiss(miss('Why hold stock?'), NOW);
    await openRecap();
    await user.click(await analyseButton());
    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
    expect(screen.getByRole('dialog').querySelector('img, script, a')).toBeNull();
  });

  it('refuses a reply it cannot read, saves nothing and can try again', async () => {
    const { calls } = mockModel('Sorry, here is some prose instead of JSON.');
    await recordMiss(miss('Why hold stock?'), NOW);
    await openRecap();
    await user.click(await analyseButton());
    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(screen.queryByText(/prose instead/)).not.toBeInTheDocument();
    expect(await dbGet(SAVED_ANALYSIS_KEY)).toBeUndefined();
    await user.click(retry);
    await waitFor(() => {
      expect(calls).toHaveLength(2);
    });
  });

  it('shows a provider error in the panel, keeps the mistakes and saves nothing', async () => {
    mockModel('{}', 429);
    await recordMiss(miss('Why hold stock?'), NOW);
    await openRecap();
    await user.click(await analyseButton());
    expect(await screen.findByText(/429/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(mistakeCards()).toHaveLength(1);
    expect(await dbGet(SAVED_ANALYSIS_KEY)).toBeUndefined();
  });

  it('stops the request when the recap closes, and saves nothing', async () => {
    const seen = hangingFetch();
    setUpModel();
    await recordMiss(miss('Why hold stock?'), NOW);
    await openRecap();
    await user.click(await analyseButton());
    await screen.findByText('Analysing your mistakes…');
    useFlowStore.getState().setUi({ recapOpen: false });
    await waitFor(() => {
      expect(seen.signal?.aborted).toBe(true);
    });
    expect(await dbGet(SAVED_ANALYSIS_KEY)).toBeUndefined();
  });

  it('stops the request when the period changes, and the new period shows its own state', async () => {
    const seen = hangingFetch();
    setUpModel();
    await recordMiss(miss('Why hold stock?'), NOW);
    await openRecap();
    await user.click(await analyseButton());
    await screen.findByText('Analysing your mistakes…');
    await user.click(period(/Last 7 days/));
    await waitFor(() => {
      expect(seen.signal?.aborted).toBe(true);
    });
    expect(await analyseButton()).toBeInTheDocument();
    expect(screen.queryByText('Analysing your mistakes…')).not.toBeInTheDocument();
  });

  it('never stores the key with the analysis', async () => {
    mockModel(GOOD_REPLY);
    await recordMiss(miss('Why hold stock?'), NOW);
    await openRecap();
    await user.click(await analyseButton());
    await screen.findByText('A hold keeps stock aside.');
    const stored = JSON.stringify(await dbGet(SAVED_ANALYSIS_KEY));
    expect(stored).toContain('A hold keeps stock aside.');
    expect(stored).not.toContain(TEST_KEY);
  });
});

describe('saved until new mistakes appear', () => {
  async function analysed() {
    const { calls } = mockModel(GOOD_REPLY);
    await recordMiss(miss('First?'), NOW);
    await recordMiss(miss('Second?'), NOW);
    await openRecap();
    await user.click(await analyseButton());
    await screen.findByText('A hold keeps stock aside.');
    expect(calls).toHaveLength(1);
    return calls;
  }

  it('reopening with no new mistakes makes no network call and shows the saved result', async () => {
    const calls = await analysed();
    for (let i = 0; i < 3; i++) {
      await reopen();
      expect(await screen.findByText('A hold keeps stock aside.')).toBeInTheDocument();
      expect(screen.getByText('Saved analysis')).toBeInTheDocument();
    }
    expect(calls).toHaveLength(1);
  });

  it('survives a fresh mount, as after a reload', async () => {
    const calls = await analysed();
    useFlowStore.getState().setUi({ recapOpen: false });
    cleanup();
    await openRecap();
    expect(await screen.findByText('A hold keeps stock aside.')).toBeInTheDocument();
    expect(calls).toHaveLength(1);
  });

  it('a new mistake ends the saved result, and only a click sends again', async () => {
    const calls = await analysed();
    await recordMiss(miss('Third?'), NOW);
    await reopen();
    expect(await screen.findByText(/new mistakes since the last analysis/)).toBeInTheDocument();
    expect(screen.queryByText('A hold keeps stock aside.')).not.toBeInTheDocument();
    expect(mistakeCards()).toHaveLength(3);
    expect(calls).toHaveLength(1);
    await user.click(await analyseButton());
    await screen.findByText('A hold keeps stock aside.');
    expect(calls).toHaveLength(2);
    await reopen();
    expect(await screen.findByText('A hold keeps stock aside.')).toBeInTheDocument();
    expect(calls).toHaveLength(2);
  });

  it('missing a known question again counts as new', async () => {
    const calls = await analysed();
    await recordMiss(miss('First?'), new Date(NOW.getTime() + 60_000));
    await reopen();
    expect(await screen.findByText(/new mistakes since the last analysis/)).toBeInTheDocument();
    expect(calls).toHaveLength(1);
  });

  it('each period keeps its own result', async () => {
    const calls = await analysed();
    await user.click(period(/Last 7 days/));
    expect(await analyseButton()).toBeInTheDocument();
    expect(screen.queryByText('A hold keeps stock aside.')).not.toBeInTheDocument();
    await user.click(period(/Today/));
    expect(await screen.findByText('A hold keeps stock aside.')).toBeInTheDocument();
    expect(calls).toHaveLength(1);
  });

  it('a damaged saved result counts as none, without an error', async () => {
    await analysed();
    await dbUpdate(SAVED_ANALYSIS_KEY, () => ({ [`today|${THIS_FLOW}`]: { groups: 'broken' } }));
    await reopen();
    expect(await analyseButton()).toBeInTheDocument();
    expect(mistakeCards()).toHaveLength(2);
    expect(screen.queryByText(/new mistakes since/)).not.toBeInTheDocument();
  });
});

describe('correct answers reduce the recap', () => {
  const correct = (question: string) =>
    recordCorrect({ flowId: THIS_FLOW, topic: 'Stock holds', question });

  it('lowers the count of a mistake missed more than once', async () => {
    await recordMiss(miss('Why hold stock?'), NOW);
    await recordMiss(miss('Why hold stock?'), NOW);
    await openRecap();
    expect(screen.getByText('Missed 2 times')).toBeInTheDocument();
    await correct('Why hold stock?');
    await reopen();
    expect(screen.getByText('Missed once')).toBeInTheDocument();
    expect(mistakeCards()).toHaveLength(1);
  });

  it('removes a mistake once its count reaches zero, and the list shows the rest', async () => {
    await recordMiss(miss('First?'), NOW);
    await recordMiss(miss('Second?'), NOW);
    await openRecap();
    expect(mistakeCards()).toHaveLength(2);
    await correct('First?');
    await reopen();
    expect(mistakeCards()).toHaveLength(1);
    expect(screen.queryByText('First?')).not.toBeInTheDocument();
    expect(screen.getByText('Second?')).toBeInTheDocument();
    expect(screen.getByText('1 mistake')).toBeInTheDocument();
  });

  it('keeps the saved analysis with no network call, hiding a group nothing is left in', async () => {
    const { calls } = mockModel(
      JSON.stringify({
        groups: [
          { title: 'About the first', points: ['Point one.'], mistakes: [1] },
          { title: 'About the second', points: ['Point two.'], mistakes: [2] },
        ],
      }),
    );
    // Both were missed once, so the later miss is number 1
    await recordMiss(miss('Earlier?'), new Date(NOW.getTime() - 60_000));
    await recordMiss(miss('Later?'), NOW);
    await openRecap();
    await user.click(await analyseButton());
    await screen.findByText('About the first');
    await correct('Later?');
    await reopen();
    expect(await screen.findByText('About the second')).toBeInTheDocument();
    expect(screen.queryByText('About the first')).not.toBeInTheDocument();
    expect(screen.getByText('Mistake 1')).toBeInTheDocument();
    expect(calls).toHaveLength(1);
  });
});

describe('period and flow', () => {
  async function seeded() {
    await recordMiss(miss('Missed today?', { topic: 'Today topic' }), daysAgo(0));
    await recordMiss(miss('Missed three days ago?', { topic: 'Week topic' }), daysAgo(3));
    await recordMiss(miss('Missed long ago?', { topic: 'Old topic' }), daysAgo(20));
    await recordMiss(
      miss('Missed in another flow?', { flowId: 't:Other', flow: 'Other', topic: 'Other topic' }),
      daysAgo(0),
    );
  }

  const shownQuestions = () =>
    mistakeCards().map((card) => card.querySelector('p')?.textContent ?? '');

  it('opens on today for the flow on screen, with a count on each period', async () => {
    await seeded();
    await openRecap();
    expect(period(/^Today · 1$/)).toHaveAttribute('aria-pressed', 'true');
    expect(period(/^Last 7 days · 2$/)).toHaveAttribute('aria-pressed', 'false');
    expect(period(/^All time · 3$/)).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'This flow' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(shownQuestions()).toEqual(['Missed today?']);
  });

  it('shows the right mistakes for each period', async () => {
    await seeded();
    await openRecap();
    await user.click(period(/Last 7 days/));
    expect(shownQuestions()).toEqual(['Missed today?', 'Missed three days ago?']);
    await user.click(period(/All time/));
    expect(shownQuestions()).toEqual([
      'Missed today?',
      'Missed three days ago?',
      'Missed long ago?',
    ]);
    await user.click(period(/Today/));
    expect(shownQuestions()).toEqual(['Missed today?']);
  });

  it('all flows adds the other flows and names each flow', async () => {
    await seeded();
    await openRecap();
    await user.click(screen.getByRole('button', { name: 'All flows' }));
    expect(period(/^Today · 2$/)).toBeInTheDocument();
    expect(period(/^All time · 4$/)).toBeInTheDocument();
    expect(shownQuestions()).toContain('Missed in another flow?');
    expect(screen.getByText('Other')).toBeInTheDocument();
  });

  it('says so when a period is empty, and offers no retry', async () => {
    await recordMiss(miss('Missed long ago?'), daysAgo(20));
    await openRecap();
    expect(mistakeCards()).toHaveLength(0);
    expect(screen.getByText(/Pick a longer period/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry my mistakes' })).not.toBeInTheDocument();
  });

  it('a page with no sequence flow has only all flows', async () => {
    await recordMiss(miss('Missed today?'), NOW);
    await openRecap('this is not a sequence diagram');
    expect(screen.getByRole('button', { name: 'This flow' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'All flows' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(shownQuestions()).toEqual(['Missed today?']);
  });
});

describe('Retry my mistakes', () => {
  it('leaves the topics of the list for the quiz and opens it, closing the recap', async () => {
    await recordMiss(miss('A?', { topic: 'Stock holds' }), NOW);
    await recordMiss(miss('B?', { topic: 'Status codes' }), NOW);
    await recordMiss(miss('C?', { topic: 'Stock holds' }), NOW);
    await recordMiss(miss('Old?', { topic: 'Not today' }), daysAgo(20));
    await openRecap();
    await user.click(screen.getByRole('button', { name: 'Retry my mistakes' }));
    expect(JSON.parse(sessionStorage.getItem(QUIZ_RETRY_KEY) ?? 'null')).toEqual({
      topics: ['Stock holds', 'Status codes'],
      flowId: THIS_FLOW,
    });
    expect(useFlowStore.getState().ui.quizOpen).toBe(true);
    expect(useFlowStore.getState().ui.recapOpen).toBe(false);
    // The quiz's own reader accepts what was written
    expect(takeQuizRetry()).toEqual({ topics: ['Stock holds', 'Status codes'], flowId: THIS_FLOW });
  });

  it('names no flow when the recap covers all flows', async () => {
    await recordMiss(miss('A?', { flowId: 't:Other', flow: 'Other', topic: 'Elsewhere' }), NOW);
    await recordMiss(miss('B?', { topic: 'Stock holds' }), NOW);
    await openRecap();
    await user.click(screen.getByRole('button', { name: 'All flows' }));
    await user.click(screen.getByRole('button', { name: 'Retry my mistakes' }));
    const retry = takeQuizRetry();
    expect(retry?.flowId).toBeNull();
    expect([...(retry?.topics ?? [])].sort()).toEqual(['Elsewhere', 'Stock holds']);
  });

  it('never takes its topics from a model reply', async () => {
    mockModel(
      JSON.stringify({
        groups: [{ title: 'Injected topic', points: ['Point.'], topics: ['Injected topic'] }],
      }),
    );
    await recordMiss(miss('A?', { topic: 'Stock holds' }), NOW);
    await openRecap();
    await user.click(await analyseButton());
    await screen.findByText('Injected topic');
    await user.click(screen.getByRole('button', { name: 'Retry my mistakes' }));
    expect(takeQuizRetry()?.topics).toEqual(['Stock holds']);
  });

  it('with nothing saved, offers a quiz instead', async () => {
    await openRecap();
    expect(screen.getByText(/No mistakes saved yet/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry my mistakes' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start a quiz' }));
    expect(useFlowStore.getState().ui.quizOpen).toBe(true);
    expect(sessionStorage.getItem(QUIZ_RETRY_KEY)).toBeNull();
  });
});

describe('the built-in sample', () => {
  it('works on the demo flow with no key, no quiz and no network, and says it is a sample', async () => {
    const { calls } = mockFetch(GOOD_REPLY);
    await openRecap(DEFAULT_DIAGRAM);
    expect(screen.getByText(/^Sample recap\./)).toBeInTheDocument();
    expect(period(/^Today · 2$/)).toBeInTheDocument();
    expect(period(/^Last 7 days · 4$/)).toBeInTheDocument();
    expect(period(/^All time · 5$/)).toBeInTheDocument();
    expect(mistakeCards()).toHaveLength(2);
    expect(screen.getAllByTestId('recap-group').length).toBeGreaterThan(0);
    expect(screen.getByText('Sample')).toBeInTheDocument();
    expect(screen.queryByText(/No model is set up/)).not.toBeInTheDocument();
    expect(calls).toHaveLength(0);
    expect(await dbGet(SAVED_ANALYSIS_KEY)).toBeUndefined();
  });

  it('sends nothing even when a model is set up', async () => {
    const { calls } = mockModel(GOOD_REPLY);
    await openRecap(DEFAULT_DIAGRAM);
    expect(screen.getByText(/^Sample recap\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Analyse my mistakes' })).not.toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it('follows the period, hiding the groups it has nothing for', async () => {
    await openRecap(DEFAULT_DIAGRAM);
    const titles = () =>
      screen.getAllByTestId('recap-group').map((group) => group.querySelector('h4')?.textContent);
    expect(titles()).toEqual(['Holds protect the stock', 'What a failure sends back']);
    await user.click(period(/All time/));
    expect(mistakeCards()).toHaveLength(5);
    expect(titles()).toHaveLength(3);
  });

  it('can start the retry quiz, as the sample quiz needs no key either', async () => {
    await openRecap(DEFAULT_DIAGRAM);
    await user.click(screen.getByRole('button', { name: 'Retry my mistakes' }));
    expect(useFlowStore.getState().ui.quizOpen).toBe(true);
    expect(takeQuizRetry()).toMatchObject({
      topics: ['Stock holds', 'Validation errors'],
      flowId: 't:Place an order',
    });
  });

  it('gives way to the mistakes the person has made', async () => {
    await recordMiss(miss('My own?', { flowId: 't:Place an order', flow: 'Place an order' }), NOW);
    await openRecap(DEFAULT_DIAGRAM);
    expect(screen.queryByText(/^Sample recap\./)).not.toBeInTheDocument();
    expect(mistakeCards()).toHaveLength(1);
    expect(screen.getByText('My own?')).toBeInTheDocument();
    expect(await screen.findByText(/No model is set up/)).toBeInTheDocument();
  });

  it('is not shown on any other flow, or once the demo flow is edited', async () => {
    await openRecap();
    expect(screen.queryByText(/^Sample recap\./)).not.toBeInTheDocument();
    useFlowStore.getState().setCode(DEFAULT_DIAGRAM.replace('Place an order', 'My copy'));
    await reopen();
    expect(screen.queryByText(/^Sample recap\./)).not.toBeInTheDocument();
    expect(screen.getByText(/No mistakes saved yet/)).toBeInTheDocument();
  });
});
