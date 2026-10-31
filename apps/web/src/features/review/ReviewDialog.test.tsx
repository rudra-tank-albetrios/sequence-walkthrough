import { parseFlow, type Flow } from '@swv/core';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useFlowStore } from '../../shared/state/flowStore.ts';
import { rememberReviewed } from './reviewed.ts';
import { ReviewDialog } from './ReviewDialog.tsx';
import { ReviewHost } from './ReviewHost.tsx';

const PROBLEM = `sequenceDiagram
    %% @spec walkthrough/2
    %% @title Save a thing
    participant C as Controller
    participant D as Database
    %% @layer C kind=controller Picks the status.
    %% @layer D kind=db Stores rows.
    %% @step The controller writes straight to the database.
    %% @threat high The table name comes from the request
    %% @threat low The write has no timeout
    C->>D: INSERT INTO things
    %% @step The row comes back.
    D-->>C: row`;

const NO_THREATS = PROBLEM.replace(/ {4}%% @threat .*\n/g, '');

function load(code: string, ui: { reviewOpen?: boolean; threatsOpen?: boolean }): Flow {
  const { flow } = parseFlow(code);
  const state = useFlowStore.getState();
  useFlowStore.setState({
    code,
    flow,
    cur: -1,
    ui: { ...state.ui, reviewOpen: false, threatsOpen: false, ...ui },
  });
  return flow;
}

beforeEach(() => {
  localStorage.clear();
});

describe('ReviewDialog', () => {
  it('shows the rating and the confidence as two results, with the honest limits', () => {
    load(PROBLEM, { reviewOpen: true });
    render(<ReviewDialog />);

    expect(screen.getByRole('dialog', { name: 'Structure review' })).toBeInTheDocument();
    expect(screen.getByTestId('review-scope')).toHaveTextContent('This flow: Save a thing');
    expect(screen.getByTestId('review-score').textContent).toMatch(/^\d+ \/ 100$/);
    expect(screen.getByRole('meter', { name: 'Structure rating' })).toHaveAttribute(
      'aria-valuemax',
      '100',
    );
    expect(screen.getByTestId('review-confidence').textContent).toMatch(/^(Low|Medium|High)$/);

    const limits = screen.getByTestId('review-limits');
    expect(limits).toHaveTextContent('One flow cannot rate a whole project');
    expect(limits).toHaveTextContent('possible problem, please check');
    expect(limits).toHaveTextContent('not a security audit');
  });

  it('lists what the rules found by area, and every rule with what happened to it', () => {
    load(PROBLEM, { reviewOpen: true });
    render(<ReviewDialog />);

    const findings = screen.getByTestId('review-findings');
    expect(within(findings).getByRole('region', { name: 'Layers' })).toHaveTextContent(
      'Controller reaches Database directly',
    );

    const rules = within(screen.getByTestId('review-rules')).getAllByRole('listitem');
    expect(rules.length).toBeGreaterThan(5);
    expect(rules.some((rule) => rule.dataset.status === 'found')).toBe(true);
  });

  it('a step link closes the review and shows that step', () => {
    load(PROBLEM, { reviewOpen: true });
    render(<ReviewDialog />);

    const [link] = within(screen.getByTestId('review-findings')).getAllByRole('button', {
      name: 'Close the review and go to step 1',
    });
    expect(link).toBeDefined();
    if (!link) return;
    fireEvent.click(link);

    const { cur, ui } = useFlowStore.getState();
    expect(cur).toBe(0);
    expect(ui.reviewOpen).toBe(false);
  });

  it('closing clears both flags', () => {
    load(PROBLEM, { threatsOpen: true });
    render(<ReviewDialog />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    const { ui } = useFlowStore.getState();
    expect(ui.reviewOpen).toBe(false);
    expect(ui.threatsOpen).toBe(false);
  });

  it('opens on the threats when asked, most serious first, worded as possible problems', () => {
    load(PROBLEM, { threatsOpen: true });
    render(<ReviewDialog />);

    expect(screen.getByRole('tab', { name: 'Threats (2)' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const threats = screen.getByTestId('review-threats');
    expect(threats).toHaveTextContent('possible problem to check');
    const items = within(threats).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('high threat');
    expect(items[0]).toHaveTextContent('The table name comes from the request');
    expect(items[1]).toHaveTextContent('low threat');
  });

  it('says that no threats does not mean safe', () => {
    load(NO_THREATS, { threatsOpen: true });
    render(<ReviewDialog />);

    expect(screen.getByRole('tab', { name: 'Threats (0)' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('review-threats')).toHaveTextContent('does not mean it is safe');
  });

  it('gives no rating for a diagram that is not a sequence diagram', () => {
    load('flowchart TD\n  A --> B', { reviewOpen: true });
    render(<ReviewDialog />);

    expect(screen.getByRole('dialog', { name: 'Structure review' })).toHaveTextContent(
      'works with sequence diagrams',
    );
    expect(screen.queryByTestId('review-score')).not.toBeInTheDocument();
  });

  it('counts a flow once, and more flows raise the confidence', () => {
    load(PROBLEM, { reviewOpen: true });
    const first = render(<ReviewDialog />);
    first.unmount();
    expect(rememberReviewed('other-1')).toBe(2);
    expect(rememberReviewed('other-1')).toBe(2);
    rememberReviewed('other-2');
    rememberReviewed('other-3');
    rememberReviewed('other-4');
    render(<ReviewDialog />);
    expect(screen.getByText('5 flows reviewed in this browser.')).toBeInTheDocument();
  });

  it('survives unreadable saved data', () => {
    localStorage.setItem('swv:review:flows', '{"not":"a list"}');
    expect(rememberReviewed('a')).toBe(1);
    localStorage.setItem('swv:review:flows', '[1,"b"]');
    expect(rememberReviewed('a')).toBe(2);
  });
});

describe('ReviewHost', () => {
  it('stays empty until a flag opens it, then loads the dialog', async () => {
    load(PROBLEM, {});
    render(<ReviewHost />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    useFlowStore.getState().setUi({ reviewOpen: true });
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });
});
