/** The wheel must add up to this before it counts as a turn. */
const THRESHOLD = 40;
/** No second step sooner than this, however hard the wheel is spun. */
export const HOLD_MS = 600;
/** The wheel has come to rest when no event arrives for this long. */
const REST_MS = 140;

/**
 * Decides when the wheel moves a step, so one big scroll is one step. After a step everything is
 * ignored until the wheel rests. A long spin moves on only after `HOLD_MS`, and only while the wheel
 * is not slowing down, because a trackpad's coasting after the fingers lift always slows down.
 */
export function createWheelGate() {
  let sum = 0;
  let locked = false;
  let lastFire = -Infinity;
  let lastEvent = -Infinity;
  let lastSize = 0;

  /** Feed one wheel event; the answer is the direction to step in, or 0 for none. */
  return (delta: number, now: number): 1 | -1 | 0 => {
    const size = Math.abs(delta);
    const rested = now - lastEvent >= REST_MS;
    const slowing = size < lastSize;
    lastEvent = now;
    lastSize = size;
    if (rested) sum = 0;
    if (locked) {
      const held = now - lastFire >= HOLD_MS;
      if (!held && !(rested && now - lastFire >= REST_MS)) return 0;
      if (held && !rested && slowing) return 0;
      locked = false;
    }
    sum += delta;
    if (Math.abs(sum) < THRESHOLD) return 0;
    const direction = sum > 0 ? 1 : -1;
    sum = 0;
    locked = true;
    lastFire = now;
    return direction;
  };
}
