import { parseFlow } from '@swv/core';
import { beforeEach, describe, expect, it } from 'vitest';

import { adoptNotes, flowId, loadNotes, saveNotes, type NotesData } from './notes.ts';
import { Store } from './store.ts';

const flowFor = (title: string) =>
  parseFlow(`sequenceDiagram\n  %% @title ${title}\n  A->>B: POST /x\n  B-->>A: 201 Created`).flow;

describe('notes storage', () => {
  beforeEach(() => {
    for (const key of Store.keys('swv:')) Store.del(key);
  });

  it('files notes under the title and reads version 2 entries unchanged', () => {
    const flow = flowFor('Old flow');
    const v2: NotesData = {
      'A→B|POST /x': { star: true, note: 'check this', n: 1, route: 'A → B', label: 'POST /x', updated: '2026-01-01T00:00:00.000Z' },
    };
    localStorage.setItem('swv:notes:t:Old flow', JSON.stringify(v2));
    expect(flowId(flow)).toBe('t:Old flow');
    expect(loadNotes(flowId(flow))).toEqual(v2);
  });

  it('drops empty entries on save', () => {
    saveNotes('t:X', { a: { star: false, note: '  ' }, b: { star: true, note: '' } });
    expect(Object.keys(loadNotes('t:X'))).toEqual(['b']);
  });

  it('adopts the stored set whose steps match a renamed flow', () => {
    saveNotes('t:Before rename', { 'A→B|POST /x': { star: true, note: '' }, 'B→A|201 Created': { star: false, note: 'n' } });
    const renamed = flowFor('After rename');
    const adopted = adoptNotes(renamed, flowId(renamed));
    expect(adopted?.hits).toBe(2);
    expect(adopted?.from).toBe('swv:notes:t:Before rename');
    expect(loadNotes('t:After rename')).toEqual(adopted?.data);
    expect(Store.keys('swv:notes:')).toEqual(['swv:notes:t:After rename']);
  });

  it('does not adopt a set that matches less than half', () => {
    saveNotes('t:Other', { x: { star: true, note: '' }, y: { star: true, note: '' }, 'A→B|POST /x': { star: true, note: '' } });
    const flow = flowFor('New');
    expect(adoptNotes(flow, flowId(flow))).toBeNull();
  });
});
