/** A rectangle in diagram units. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The smallest box around the given boxes; null when there are none. */
export function union(boxes: (Box | null)[]): Box | null {
  const list = boxes.filter((b): b is Box => b !== null);
  if (list.length === 0) return null;
  const x0 = Math.min(...list.map((b) => b.x));
  const y0 = Math.min(...list.map((b) => b.y));
  const x1 = Math.max(...list.map((b) => b.x + b.w));
  const y1 = Math.max(...list.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
