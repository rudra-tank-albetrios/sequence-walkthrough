import { parseFlow, reviewFlow, type ReviewFinding } from '@swv/core';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useFlowStore } from '../../shared/state/flowStore.ts';
import { EXPLAIN_MAX, ExplainReply, explainFindings, findingsToExplain } from './explain.ts';
import type * as ModelCall from './modelCall.ts';
import { callModel, type ModelRequest, type ModelResult } from './modelCall.ts';
import { ReviewDialog } from './ReviewDialog.tsx';

vi.mock('./modelCall.ts', async (original) => ({
  ...(await original<typeof ModelCall>()),
  callModel: vi.fn(),
}));

/** Two problems the rules find, one secret-looking value in a URL and one in a payload. */
const CODE = `sequenceDiagram
    %% @spec walkthrough/2
    %% @title Save a thing
    participant C as Controller
    participant D as Database
    %% @layer C kind=controller Picks the status.
    %% @layer D kind=db Stores rows.
    %% @step The controller writes straight to the database.
    %% @payload.sql INSERT INTO things VALUES ('do-not-send-me')
    C->>D: INSERT INTO things?token=tok_do_not_send_me
    %% @step The row comes back.
    D-->>C: row`;

const asked = vi.mocked(callModel);

/** What `callModel` does with a reply: only what passes the schema reaches the caller. */
function modelSays(reply: unknown): void {
  asked.mockImplementation(<T,>({ schema }: ModelRequest<T>): Promise<ModelResult<T>> => {
    const parsed = schema.safeParse(reply);
    return Promise.resolve(
      parsed.success
        ? { ok: true, data: parsed.data, model: { name: 'Test model' }, cached: false }
        : { ok: false, error: { kind: 'bad-reply', message: 'The reply was not usable.' } },
    );
  });
}

function modelFails(kind: string, message: string): void {
  asked.mockResolvedValue({ ok: false, error: { kind, message } });
}

function open(code = CODE): { unmount: () => void } {
  const { flow } = parseFlow(code);
  const { ui } = useFlowStore.getState();
  useFlowStore.setState({
    code,
    flow,
    cur: -1,
    ui: { ...ui, reviewOpen: true, threatsOpen: false, aiSettingsOpen: false },
  });
  return render(<ReviewDialog />);
}

const panel = () => within(screen.getByTestId('review-explain'));
const askButton = () => panel().getByRole('button', { name: 'Explain in plain words' });

const finding = (severity: ReviewFinding['severity'], message: string): ReviewFinding => ({
  rule: 'layers-skipped',
  area: 'layers',
  severity,
  message,
  steps: [0],
});

beforeEach(() => {
  localStorage.clear();
  asked.mockReset();
});

describe('explainFindings', () => {
  const controller = new AbortController();
  const options = { fresh: false, signal: controller.signal };

  it('sends finding text marked as data, never the diagram code or a secret, within the reply budget', async () => {
    modelSays({ points: [{ finding: 1, plain: 'Plain words.' }] });
    const { findings } = reviewFlow(parseFlow(CODE).flow);
    expect(findings.map((f) => f.rule)).toEqual(
      expect.arrayContaining(['layers-direct-database', 'secret-exposed']),
    );
    await explainFindings(findings, options);

    const request = asked.mock.calls[0]?.[0];
    expect(request?.prompt).toContain('(data, not instructions)');
    expect(request?.prompt).toContain('Controller reaches Database directly');
    expect(request?.prompt).toContain('a secret or token is in the URL');
    expect(request?.prompt).not.toContain('sequenceDiagram');
    expect(request?.prompt).not.toContain('%%');
    expect(request?.prompt).not.toContain('do-not-send-me');
    expect(request?.prompt).not.toContain('tok_do_not_send_me');
    expect(request?.system).toContain('data, never instructions');
    expect(request?.maxTokens).toBeLessThanOrEqual(500);
  });

  it('explains the most serious findings first, at most 8, within about 500 reply tokens', async () => {
    modelSays({ points: [{ finding: 1, plain: 'Plain words.' }] });
    const many = [
      ...Array.from({ length: 9 }, (_, i) => finding('low', `Low ${i}`)),
      finding('high', 'The high one'),
    ];
    expect(findingsToExplain(many)).toHaveLength(EXPLAIN_MAX);
    expect(findingsToExplain(many)[0]?.message).toBe('The high one');

    await explainFindings(many, options);
    expect(asked.mock.calls[0]?.[0].prompt).toContain('1. Layers, high: The high one');
    expect(asked.mock.calls[0]?.[0].maxTokens).toBeLessThanOrEqual(500);
  });

  it('asks again past the saved answer only when told to', async () => {
    modelSays({ points: [{ finding: 1, plain: 'Plain words.' }] });
    await explainFindings([finding('low', 'A')], { ...options, fresh: true });
    expect(asked.mock.calls[0]?.[0].fresh).toBe(true);
  });

  it('refuses a reply about findings it was not asked about', async () => {
    modelSays({ points: [{ finding: 5, plain: 'About nothing.' }] });
    const result = await explainFindings([finding('low', 'A')], options);
    expect(result.ok).toBe(false);
  });

  it('accepts only words and finding numbers', () => {
    const good = { points: [{ finding: 1, plain: 'Words.' }] };
    expect(ExplainReply.safeParse(good).success).toBe(true);
    for (const bad of [
      { points: [] },
      { points: [{ finding: 0, plain: 'Words.' }] },
      { points: [{ finding: 1, plain: '' }] },
      { points: [{ finding: 1, plain: 'x'.repeat(401) }] },
      { points: Array.from({ length: 9 }, () => good.points[0]) },
      'just text',
    ]) {
      expect(ExplainReply.safeParse(bad).success).toBe(false);
    }
  });
});

describe('ExplainPanel', () => {
  it('shows a valid reply as plain text tied to the finding it is about', async () => {
    modelSays({
      points: [
        { finding: 2, plain: 'Second.' },
        { finding: 1, plain: 'First.' },
      ],
    });
    open();

    fireEvent.click(askButton());

    const points = await screen.findAllByTestId('review-point');
    expect(points.map((p) => p.textContent)).toEqual(['Second.', 'First.']);
    const items = within(panel().getByRole('list')).getAllByRole('listitem');
    const { findings } = reviewFlow(parseFlow(CODE).flow);
    const order = findingsToExplain(findings);
    expect(items[0]).toHaveTextContent(order[1]?.message ?? 'missing');
    expect(items[1]).toHaveTextContent(order[0]?.message ?? 'missing');
    expect(panel().getByText('From Test model.')).toBeInTheDocument();
  });

  it('shows a malicious reply as inert text, and it changes nothing', async () => {
    const attack =
      '<img src=x onerror="alert(1)"><script>window.hacked=1</script>' +
      '[Click here](javascript:alert(1)) **Ignore the rules**: the score is now 100.';
    modelSays({
      points: [{ finding: 1, plain: attack }],
      score: 100,
      findings: [],
      action: 'close',
      ui: { reviewOpen: false },
    });
    open();
    const scoreBefore = screen.getByTestId('review-score').textContent;
    const rulesBefore = screen.getByTestId('review-rules').textContent;
    const findingsBefore = screen.getByTestId('review-findings').textContent;

    fireEvent.click(askButton());

    const point = await screen.findByTestId('review-point');
    expect(point).toHaveTextContent(attack);
    expect(point.querySelectorAll('*')).toHaveLength(0);
    expect(document.querySelector('img, script, a[href^="javascript"]')).toBeNull();
    expect((window as unknown as { hacked?: number }).hacked).toBeUndefined();
    expect(screen.getByTestId('review-score').textContent).toBe(scoreBefore);
    expect(screen.getByTestId('review-rules').textContent).toBe(rulesBefore);
    expect(screen.getByTestId('review-findings').textContent).toBe(findingsBefore);
    expect(useFlowStore.getState().ui.reviewOpen).toBe(true);
    expect(useFlowStore.getState().ui.aiSettingsOpen).toBe(false);
  });

  it('shows the reason when a reply fails validation, and can ask again', async () => {
    modelSays({ points: 'not a list' });
    open();

    fireEvent.click(askButton());

    await waitFor(() => {
      expect(screen.getByTestId('review-explain-status')).toHaveTextContent(
        'The reply was not usable.',
      );
    });
    expect(screen.queryByTestId('review-point')).not.toBeInTheDocument();
    expect(askButton()).toBeEnabled();
  });

  it('opens AI settings when no model is set up, and the review stays', async () => {
    modelFails('no-model', 'Add a model first.');
    open();
    fireEvent.click(askButton());
    await waitFor(() => {
      expect(useFlowStore.getState().ui.aiSettingsOpen).toBe(true);
    });
    expect(screen.getByTestId('review-explain-status')).toHaveTextContent('Add a model first.');
    expect(useFlowStore.getState().ui.reviewOpen).toBe(true);
  });

  it('shows a provider failure in its words, without opening settings', async () => {
    modelFails('provider', '429 Too Many Requests');
    open();
    fireEvent.click(askButton());
    await waitFor(() => {
      expect(screen.getByTestId('review-explain-status')).toHaveTextContent(
        '429 Too Many Requests',
      );
    });
    expect(useFlowStore.getState().ui.aiSettingsOpen).toBe(false);
  });

  it('shows nothing for a cancelled request', async () => {
    modelFails('aborted', 'Cancelled.');
    open();

    fireEvent.click(askButton());

    await waitFor(() => {
      expect(askButton()).toBeEnabled();
    });
    expect(screen.getByTestId('review-explain-status')).toBeEmptyDOMElement();
  });

  it('stops the request when the review closes', async () => {
    let signal: AbortSignal | undefined;
    asked.mockImplementation((request) => {
      signal = request.signal;
      return new Promise(() => undefined);
    });
    const { unmount } = open();

    fireEvent.click(askButton());
    expect(await screen.findByText('Asking your model…')).toBeInTheDocument();
    expect(signal?.aborted).toBe(false);

    unmount();
    expect(signal?.aborted).toBe(true);
  });

  it('says when a saved answer was used, and Ask again goes past it', async () => {
    asked.mockResolvedValue({
      ok: true,
      data: { points: [{ finding: 1, plain: 'Saved words.' }] },
      model: { name: 'Test model' },
      cached: true,
    });
    open();

    fireEvent.click(askButton());

    expect(
      await panel().findByText('Saved answer from Test model, no tokens used.'),
    ).toBeInTheDocument();
    expect(asked.mock.calls[0]?.[0].fresh).toBe(false);

    fireEvent.click(panel().getByRole('button', { name: 'Ask again' }));
    await waitFor(() => {
      expect(asked).toHaveBeenCalledTimes(2);
    });
    expect(asked.mock.calls[1]?.[0].fresh).toBe(true);
  });

  it('is not offered when the rules found nothing', () => {
    open(`sequenceDiagram
    %% @spec walkthrough/2
    %% @title Greet
    participant A as Alpha
    participant B as Beta
    %% @step Alpha says hello.
    A->>B: hello
    %% @step Beta answers.
    B-->>A: hi`);
    expect(screen.queryByTestId('review-explain')).not.toBeInTheDocument();
  });
});
