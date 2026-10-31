import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_DIAGRAM } from '../../shared/lib/defaultDiagram.ts';
import { useDiagramStore } from '../../shared/state/diagramStore.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { Tour } from './Tour.tsx';
import { TOUR_SEEN_KEY } from './visit.ts';

// Adding a stop is one entry in the data file: these three entries are all the tour needs.
vi.mock('./stops.ts', () => ({
  TOUR_STOPS: [
    { id: 'first', title: 'First stop', body: 'On the page.', target: 'on-page' },
    {
      id: 'opens',
      title: 'Opens a panel',
      body: 'Opens the code panel for this stop.',
      target: 'not-on-page',
      open: { codeOpen: true },
      step: 1,
    },
    {
      id: 'usage',
      title: 'Last stop',
      body: 'With simulated usage.',
      target: 'not-on-page',
      demoUsage: {
        bars: [{ model: 'Groq', usedPercent: 96, left: '40 left' }],
        notice: 'Switched models',
      },
    },
  ],
}));

const OTHER_CODE = 'sequenceDiagram\n  %% @title Other\n  A->>B: one\n  B-->>A: two';

function loadCode(code: string) {
  useFlowStore.setState({ ...useFlowStore.getInitialState() });
  useDiagramStore.setState({ rendering: false, cleanSvg: '<svg></svg>', error: null });
  useFlowStore.getState().setCode(code);
}

function renderTour() {
  return render(
    <>
      <div data-tour="on-page">Target</div>
      <Tour />
    </>,
  );
}

const currentStop = () => screen.findByRole('dialog');

describe('Tour', () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = '';
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const size = this.dataset.tour === undefined ? 0 : 100;
      return new DOMRect(10, 10, size, size);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    act(() => {
      useFlowStore.setState({ ...useFlowStore.getInitialState() });
    });
  });

  it('starts by itself on a first visit to the demo flow, and remembers it', async () => {
    loadCode(DEFAULT_DIAGRAM);
    renderTour();
    expect(await currentStop()).toHaveAccessibleName(/First stop/);
    expect(screen.getByTestId('tour-spotlight')).toBeInTheDocument();
    expect(localStorage.getItem(TOUR_SEEN_KEY)).toBe('true');
  });

  it('does not start by itself for a returning visitor, but opens from the store flag', async () => {
    localStorage.setItem(TOUR_SEEN_KEY, 'true');
    loadCode(DEFAULT_DIAGRAM);
    renderTour();
    expect(screen.queryByRole('dialog')).toBeNull();

    act(() => {
      useFlowStore.getState().setUi({ tourOpen: true });
    });
    expect(await currentStop()).toHaveAccessibleName(/First stop/);
  });

  it('opens a stop through its ui flags and step, then closes them when moving on', async () => {
    const user = userEvent.setup();
    localStorage.setItem(TOUR_SEEN_KEY, 'true');
    loadCode(DEFAULT_DIAGRAM);
    renderTour();
    act(() => {
      useFlowStore.getState().setUi({ tourOpen: true });
    });

    await user.click(await screen.findByRole('button', { name: 'Next' }));
    expect(await currentStop()).toHaveAccessibleName(/Opens a panel/);
    expect(useFlowStore.getState().ui.codeOpen).toBe(true);
    expect(useFlowStore.getState().cur).toBe(1);
    // Its target is not on the page, so the card shows centred with no spotlight.
    expect(screen.queryByTestId('tour-spotlight')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await currentStop()).toHaveAccessibleName(/Last stop/);
    expect(useFlowStore.getState().ui.codeOpen).toBe(false);
  });

  it('labels the simulated usage "Demo" and shows it on its own stop only', async () => {
    const user = userEvent.setup();
    localStorage.setItem(TOUR_SEEN_KEY, 'true');
    loadCode(DEFAULT_DIAGRAM);
    renderTour();
    act(() => {
      useFlowStore.getState().setUi({ tourOpen: true });
    });

    await user.click(await screen.findByRole('button', { name: 'Next' }));
    expect(await currentStop()).toHaveAccessibleName(/Opens a panel/);
    expect(screen.queryByTestId('tour-demo-usage')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await currentStop()).toHaveAccessibleName(/Last stop/);
    const demo = screen.getByTestId('tour-demo-usage');
    expect(demo).toHaveTextContent('Demo');
    expect(demo).toHaveTextContent('96% used, 40 left');
    expect(screen.getByRole('meter', { name: 'Groq usage, demo' })).toHaveAttribute(
      'aria-valuenow',
      '96',
    );

    await user.click(screen.getByRole('button', { name: 'Finish' }));
    expect(screen.queryByTestId('tour-demo-usage')).toBeNull();
  });

  it('loads the demo flow for the tour and puts everything back when skipped', async () => {
    const user = userEvent.setup();
    localStorage.setItem(TOUR_SEEN_KEY, 'true');
    loadCode(OTHER_CODE);
    const store = useFlowStore.getState();
    store.go(1);
    store.setUi({ insightOpen: true });
    renderTour();
    act(() => {
      useFlowStore.getState().setUi({ tourOpen: true });
    });

    await currentStop();
    expect(useFlowStore.getState().code).toBe(DEFAULT_DIAGRAM);
    expect(useFlowStore.getState().ui.insightOpen).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Skip tour' }));
    const after = useFlowStore.getState();
    expect(after.code).toBe(OTHER_CODE);
    expect(after.cur).toBe(1);
    expect(after.ui.insightOpen).toBe(true);
    expect(after.ui.tourOpen).toBe(false);
  });

  it('moves with the arrow keys, not past the ends, and Esc ends the tour', async () => {
    const user = userEvent.setup();
    localStorage.setItem(TOUR_SEEN_KEY, 'true');
    loadCode(DEFAULT_DIAGRAM);
    renderTour();
    act(() => {
      useFlowStore.getState().setUi({ tourOpen: true });
    });

    expect(await currentStop()).toHaveAccessibleName(/First stop/);
    await user.keyboard('{ArrowLeft}');
    expect(await currentStop()).toHaveAccessibleName(/First stop/);

    await user.keyboard('{ArrowRight}');
    expect(await currentStop()).toHaveAccessibleName(/Opens a panel/);
    expect(await screen.findByRole('button', { name: 'Next' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(await currentStop()).toHaveAccessibleName(/Last stop/);
    await user.keyboard('{ArrowRight}');
    expect(await currentStop()).toHaveAccessibleName(/Last stop/);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useFlowStore.getState().ui.tourOpen).toBe(false);
  });
});
