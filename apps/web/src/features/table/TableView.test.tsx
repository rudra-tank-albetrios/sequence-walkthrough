import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useFlowStore } from '../../shared/state/flowStore.ts';
import { TableView } from './TableView.tsx';

const CODE = [
  'sequenceDiagram',
  '  %% @title Nav',
  '  %% @section One',
  '  %% @step Asks for x.',
  '  %% @ref src/a/b.ts:3',
  '  A->>B: POST /x',
  '  alt ok',
  '    B-->>A: 201 Created',
  '  else bad',
  '    B-->>A: 409 Conflict',
  '  end',
  '  %% @section Two',
  '  A->>B: GET /y',
  '  B-->>A: 200 OK',
].join('\n');

const bodyRows = () => screen.getAllByRole('row').filter((row) => row.hasAttribute('data-step'));

describe('table view', () => {
  beforeEach(() => {
    useFlowStore.setState({ cur: -1, path: 'all', spot: null, view: 'table', findQuery: '', follow: null });
    useFlowStore.getState().setCode(CODE);
  });

  it('shows the columns in order and one row per step', () => {
    render(<TableView />);
    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent);
    expect(headers).toEqual(['#', 'Chapter', 'From → To', 'Sends', 'Does', 'Branch', 'Behind', 'Ref', '★ Note']);
    expect(bodyRows()).toHaveLength(5);
    expect(screen.getByText('Asks for x.')).toBeInTheDocument();
    expect(screen.getAllByText('No explanation')).toHaveLength(4);
    expect(screen.getByTitle(/^Conflict:/)).toHaveTextContent('409');
  });

  it('hides the steps the path filter and the spotlight leave out', () => {
    render(<TableView />);
    act(() => {
      useFlowStore.getState().setPath('happy');
    });
    expect(bodyRows().map((row) => row.getAttribute('data-step'))).toEqual(['0', '1', '3', '4']);
    act(() => {
      useFlowStore.getState().setPath('all');
      useFlowStore.getState().setSpot('C');
    });
    expect(bodyRows()).toHaveLength(0);
  });

  it('marks the current row and a click goes to the step without moving the camera', () => {
    render(<TableView />);
    const row = bodyRows()[2];
    expect(row).toBeDefined();
    if (!row) return;
    fireEvent.click(row);
    const state = useFlowStore.getState();
    expect(state.cur).toBe(2);
    expect(state.lastGo.camera).toBe(false);
    expect(row).toHaveAttribute('aria-current', 'step');
    fireEvent.doubleClick(row);
    expect(useFlowStore.getState().view).toBe('diagram');
  });

  it('underlines the rows that match the Find query', () => {
    render(<TableView />);
    act(() => {
      useFlowStore.getState().setFindQuery('GET /y');
    });
    const hits = bodyRows().filter((row) => row.className.includes('findhit'));
    expect(hits.map((row) => row.getAttribute('data-step'))).toEqual(['3']);
  });
});
