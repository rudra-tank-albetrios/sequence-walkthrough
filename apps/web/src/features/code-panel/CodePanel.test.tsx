import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useFlowStore } from '../../shared/state/flowStore.ts';
import { CodePanel } from './CodePanel.tsx';

const CODE = [
  'sequenceDiagram',
  '  %% @title Nav',
  '  participant A as Alpha',
  '  participant B as Beta',
  '  %% @section One',
  '  %% @step Alpha asks.',
  '  A->>B: POST /x',
  '  B-->>A: 201 Created',
].join('\n');

describe('code panel', () => {
  beforeEach(() => {
    useFlowStore.setState({ cur: -1, path: 'all', spot: null, lastGo: { index: -1, camera: true, seq: 0 } });
    useFlowStore.getState().setCode(CODE);
    useFlowStore.getState().setUi({ codeOpen: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('colours tags, keywords, arrows and aliases in the highlight layer', () => {
    render(<CodePanel />);
    const tags = [...document.querySelectorAll('.t-tag')].map((el) => el.textContent);
    expect(tags).toEqual(['%% @title', '%% @section', '%% @step']);
    expect(document.querySelector('.t-tagtx')?.textContent).toBe(' Nav');
    const keywords = [...document.querySelectorAll('.t-kw')].map((el) => el.textContent);
    expect(keywords).toContain('sequenceDiagram');
    expect(keywords).toContain('participant');
    const arrows = [...document.querySelectorAll('.t-ar')].map((el) => el.textContent);
    expect(arrows).toEqual(['->>', '-->>']);
    // Version 2 colours the alias of `participant A as Alpha` and the two ends of an arrow, not the display name.
    const aliases = [...document.querySelectorAll('.t-al')].map((el) => el.textContent.trim());
    expect(aliases).toEqual(['A', 'B', 'A', 'B', 'B', 'A']);
  });

  it('shows the arrow lines with their step number in the gutter', () => {
    render(<CodePanel />);
    const gutter = screen.getByLabelText('Diagram code').parentElement?.previousElementSibling;
    const arrowLine = gutter?.querySelector('[data-line="6"]');
    expect(arrowLine?.textContent).toBe('17');
    expect(gutter?.querySelector('[data-line="5"]')?.textContent).toBe('•6');
  });

  it('lists the lint notes and a click selects the line and goes to its step', () => {
    render(<CodePanel />);
    const note = screen.getByRole('button', { name: /has no @step/ });
    expect(note.textContent).toMatch(/^line 8:/);
    fireEvent.click(note);
    const state = useFlowStore.getState();
    expect(state.cur).toBe(1);
    expect(state.lastGo.from).toBe('editor');
    const textarea = screen.getByLabelText<HTMLTextAreaElement>('Diagram code');
    const caretLine = textarea.value.slice(0, textarea.selectionStart).split('\n').length - 1;
    expect(caretLine).toBe(7);
  });

  it('re-parses the code a moment after typing', () => {
    vi.useFakeTimers();
    render(<CodePanel />);
    const textarea = screen.getByLabelText<HTMLTextAreaElement>('Diagram code');
    fireEvent.change(textarea, { target: { value: `${CODE}\n  B-->>A: 500 Boom` } });
    expect(useFlowStore.getState().flow?.steps.length).toBe(2);
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(useFlowStore.getState().flow?.steps.length).toBe(2);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(useFlowStore.getState().flow?.steps.length).toBe(3);
    expect(screen.getByText(/3 steps · Rendered in/)).toBeInTheDocument();
  });

  it('moving the caret onto an arrow line selects that step', () => {
    render(<CodePanel />);
    const textarea = screen.getByLabelText<HTMLTextAreaElement>('Diagram code');
    const position = CODE.indexOf('B-->>A');
    textarea.setSelectionRange(position, position);
    fireEvent.click(textarea);
    expect(useFlowStore.getState().cur).toBe(1);
  });
});
