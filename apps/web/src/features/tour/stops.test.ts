import { describe, expect, it } from 'vitest';

import { TOUR_STOPS } from './stops.ts';

describe('TOUR_STOPS', () => {
  it('walks the features in the order the plan lists them', () => {
    expect(TOUR_STOPS.map((stop) => stop.id)).toEqual([
      'layers',
      'voice',
      'flow-rail',
      'side-parts',
      'ask-ai',
      'usage',
      'quiz',
      'recap',
      'review',
      'exports',
    ]);
  });

  it('gives every stop a target, a title and a text', () => {
    for (const stop of TOUR_STOPS) {
      expect(stop.target, stop.id).not.toBe('');
      expect(stop.title, stop.id).not.toBe('');
      expect(stop.body, stop.id).not.toBe('');
    }
  });

  it('keeps the simulated usage on one stop, with the usage colours in range', () => {
    const withUsage = TOUR_STOPS.filter((stop) => stop.demoUsage);
    expect(withUsage.map((stop) => stop.id)).toEqual(['usage']);
    for (const bar of withUsage[0]?.demoUsage?.bars ?? []) {
      expect(bar.usedPercent).toBeGreaterThanOrEqual(0);
      expect(bar.usedPercent).toBeLessThanOrEqual(100);
    }
  });
});
