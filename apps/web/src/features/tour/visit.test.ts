import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_DIAGRAM } from '../../shared/lib/defaultDiagram.ts';
import { Store } from '../../shared/storage/store.ts';
import { markTourSeen, shouldStartByItself } from './visit.ts';

describe('shouldStartByItself', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is true on a first plain visit to the demo flow', () => {
    expect(shouldStartByItself(DEFAULT_DIAGRAM, '')).toBe(true);
    expect(shouldStartByItself(DEFAULT_DIAGRAM, '#')).toBe(true);
  });

  it('is false once the tour has run in this browser', () => {
    markTourSeen();
    expect(shouldStartByItself(DEFAULT_DIAGRAM, '')).toBe(false);
  });

  it('is false for a shared link or for other code', () => {
    expect(shouldStartByItself(DEFAULT_DIAGRAM, '#step=3')).toBe(false);
    expect(shouldStartByItself('sequenceDiagram\n  A->>B: hi', '')).toBe(false);
  });

  it('is false when the browser cannot remember that the tour has run', () => {
    vi.spyOn(Store, 'ok', 'get').mockReturnValue(false);
    expect(shouldStartByItself(DEFAULT_DIAGRAM, '')).toBe(false);
  });
});
