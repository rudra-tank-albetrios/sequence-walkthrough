import { parseFlow, type Flow } from '@swv/core';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_DIAGRAM } from '../../shared/lib/defaultDiagram.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { useNotesStore } from '../../shared/state/notesStore.ts';
import { WalkBar } from './WalkBar.tsx';

const NOTES_KEY = 'swv:notes:t:Place an order';

const TWO_STEPS = `sequenceDiagram
    %% @spec walkthrough/2
    %% @title Tiny
    participant A as Alpha
    participant B as Beta
    %% @step Alpha asks.
    A->>B: GET /things
    %% @step Beta answers.
    B-->>A: 200 OK`;

function load(code: string): Flow {
  const flow = parseFlow(code).flow;
  useFlowStore.setState({ code, flow, cur: -1, path: 'all', follow: null, chapterLock: false, playing: false });
  useNotesStore.setState({ id: '', data: {} });
  useNotesStore.getState().load(flow);
  return flow;
}

beforeAll(() => {
  // jsdom has neither; the bar only needs them to exist.
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
  Element.prototype.scrollIntoView = () => undefined;
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('WalkBar with the demo flow', () => {
  it('shows the status explainer and the pairing chip on a reply, and the replies on its request', () => {
    const flow = load(DEFAULT_DIAGRAM);
    const conflict = flow.steps.find((s) => s.status?.code === 409);
    expect(conflict).toBeDefined();
    if (!conflict) return;
    useFlowStore.setState({ cur: conflict.idx });
    render(<WalkBar />);

    expect(screen.getByTestId('status')).toHaveTextContent('409');
    expect(screen.getByTestId('status-note').textContent).toMatch(/^Conflict:/);
    const pair = screen.getByTestId('pair-chip');
    expect(pair.textContent).toMatch(/^answers step \d+: POST \/api\/orders/);

    fireEvent.click(pair);
    const request = flow.steps[conflict.answers];
    expect(useFlowStore.getState().cur).toBe(request?.idx);
    cleanup();
    render(<WalkBar />);
    const replies = within(screen.getByTestId('replies')).getAllByRole('button');
    expect(replies.length).toBeGreaterThanOrEqual(2);
    expect(replies.some((b) => b.textContent?.startsWith('409 Conflict'))).toBe(true);
  });

  it('shows the overview card at the start with the endings and the layers', () => {
    const flow = load(DEFAULT_DIAGRAM);
    render(<WalkBar />);
    const overview = screen.getByTestId('overview');
    expect(within(overview).getByRole('heading', { level: 3 })).toHaveTextContent('Place an order');
    expect(within(overview).getByText(/Starts when:/)).toBeInTheDocument();
    expect(within(screen.getByTestId('endings')).getAllByRole('button')).toHaveLength(flow.endings.length);
    expect(screen.getByRole('button', { name: 'Previous step' })).toBeDisabled();
    expect(screen.getByTestId('card-next')).toHaveTextContent('Step 1');
  });

  it('has one progress segment per chapter', () => {
    const flow = load(DEFAULT_DIAGRAM);
    render(<WalkBar />);
    expect(flow.sections.length).toBeGreaterThan(1);
    expect(screen.getAllByTestId('progress-seg')).toHaveLength(flow.sections.length);
    expect(within(screen.getByTestId('chapters')).getAllByRole('button')).toHaveLength(flow.sections.length + 1);
  });

  it('offers the path filter with the branch options', () => {
    load(DEFAULT_DIAGRAM);
    render(<WalkBar />);
    const select = screen.getByTestId<HTMLSelectElement>('path-select');
    const labels = [...select.options].map((o) => o.textContent);
    expect(labels.slice(0, 3)).toEqual(['Path: all steps', 'Happy path only', 'Errors only']);
    expect(labels.some((l) => l?.startsWith('alt ') || l?.startsWith('else '))).toBe(true);
    fireEvent.change(select, { target: { value: 'happy' } });
    expect(useFlowStore.getState().path).toBe('happy');
  });

  it('bookmarks the current step and keeps it in localStorage', () => {
    load(DEFAULT_DIAGRAM);
    useFlowStore.setState({ cur: 0 });
    render(<WalkBar />);
    expect(screen.getByTestId('bm-btn')).toHaveTextContent('★ 0');

    fireEvent.click(screen.getByTestId('star-btn'));
    expect(screen.getByTestId('star-btn')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('bm-btn')).toHaveTextContent('★ 1');
    const stored = JSON.parse(localStorage.getItem(NOTES_KEY) ?? '{}') as Record<string, { star: boolean }>;
    expect(Object.values(stored)).toHaveLength(1);
    expect(Object.values(stored)[0]?.star).toBe(true);

    fireEvent.click(screen.getByTestId('star-btn'));
    expect(screen.getByTestId('bm-btn')).toHaveTextContent('★ 0');
    expect(localStorage.getItem(NOTES_KEY)).toBe('{}');
  });

  it('announces the step for screen readers', () => {
    load(DEFAULT_DIAGRAM);
    useFlowStore.setState({ cur: 0 });
    render(<WalkBar />);
    expect(screen.getByTestId('live').textContent).toMatch(/^Step 1 of \d+\. Shopper to Pages: Click "Place order"\./);
  });
});

describe('WalkBar with a flow without branches', () => {
  it('hides the path select and the chapters', () => {
    load(TWO_STEPS);
    render(<WalkBar />);
    expect(screen.queryByTestId('path-select')).toBeNull();
    expect(screen.queryByTestId('chapters')).toBeNull();
    expect(screen.getAllByTestId('progress-seg')).toHaveLength(1);
  });

  it('shows the fallback replies text and the kind chips', () => {
    load(TWO_STEPS);
    useFlowStore.setState({ cur: 1 });
    render(<WalkBar />);
    expect(screen.getByTestId('status-note').textContent).toMatch(/^OK:/);
    expect(screen.getByTestId('pair-chip')).toHaveTextContent('answers step 1: GET /things');
  });
});
