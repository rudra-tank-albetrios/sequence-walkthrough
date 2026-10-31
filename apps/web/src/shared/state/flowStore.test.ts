import { beforeEach, describe, expect, it } from 'vitest';

import { useFlowStore } from './flowStore.ts';

const CODE = [
  'sequenceDiagram',
  '  %% @title Nav',
  '  %% @section One',
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

describe('flow store navigation', () => {
  beforeEach(() => {
    useFlowStore.setState({ cur: -1, path: 'all', chapterLock: false });
    useFlowStore.getState().setCode(CODE);
  });

  it('parses the code into a flow and clamps the current step', () => {
    const { flow } = useFlowStore.getState();
    expect(flow?.steps.length).toBe(5);
    useFlowStore.getState().go(99);
    expect(useFlowStore.getState().cur).toBe(4);
  });

  it('skips steps the path filter hides', () => {
    const s = useFlowStore.getState();
    s.setPath('happy');
    s.go(0);
    expect(s.next()).toBeNull();
    expect(useFlowStore.getState().cur).toBe(1);
    expect(useFlowStore.getState().next()).toBeNull();
    // step 2 (409, in else) is hidden, so the next visible step is 3
    expect(useFlowStore.getState().cur).toBe(3);
  });

  it('stops at the chapter edge when the chapter is locked', () => {
    const s = useFlowStore.getState();
    s.go(2);
    s.toggleChapterLock();
    expect(useFlowStore.getState().next()).toMatch(/End of this chapter/);
    expect(useFlowStore.getState().cur).toBe(2);
  });

  it('goes back to the overview from the first step', () => {
    const s = useFlowStore.getState();
    s.go(0);
    expect(s.prev()).toBeNull();
    expect(useFlowStore.getState().cur).toBe(-1);
  });
});
