import { describe, expect, it } from 'vitest';

import { createWheelGate } from './wheelGate.ts';

/** Plays wheel events, as [time, delta], and returns how many steps they moved. */
function steps(events: [number, number][]): number {
  const gate = createWheelGate();
  return events.filter(([at, delta]) => gate(delta, at) !== 0).length;
}

describe('the wheel gate', () => {
  it('one huge scroll moves one step', () => {
    expect(steps([[0, 2400]])).toBe(1);
  });

  it('a fast burst of notches moves one step', () => {
    expect(steps([0, 16, 32, 48, 64, 80, 96, 112].map((at) => [at, 120]))).toBe(1);
  });

  it('a trackpad coasting to a stop moves one step, however long it coasts', () => {
    const coast: [number, number][] = [];
    for (let i = 0; i < 90; i++) coast.push([i * 16, 200 - i * 2]);
    expect(steps(coast)).toBe(1);
  });

  it('a steady long spin moves on, one step per hold', () => {
    const spin: [number, number][] = [];
    for (let at = 0; at <= 1300; at += 50) spin.push([at, 100]);
    expect(steps(spin)).toBe(3);
  });

  it('separate turns each move a step', () => {
    expect(
      steps([
        [0, 100],
        [300, 100],
        [600, 100],
      ]),
    ).toBe(3);
  });

  it('a small nudge does nothing, and is forgotten after a rest', () => {
    expect(
      steps([
        [0, 20],
        [300, 30],
      ]),
    ).toBe(0);
  });

  it('gives the direction', () => {
    const gate = createWheelGate();
    expect(gate(-100, 0)).toBe(-1);
    expect(gate(100, 300)).toBe(1);
  });
});
