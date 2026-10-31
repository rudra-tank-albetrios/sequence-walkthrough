import { clamp } from '../../shared/lib/util.ts';

export interface Size {
  width: number;
  height: number;
}

export interface Box extends Size {
  left: number;
  top: number;
}

const GAP = 12;
const EDGE = 8;

/**
 * Where the card goes: below the target, above it, then beside it. A target that leaves no room,
 * such as the whole diagram, gets the card over its lower part. The card always stays on screen.
 */
export function placeCard(target: Box | null, card: Size, view: Size): Pick<Box, 'left' | 'top'> {
  const inX = (x: number) => clamp(x, EDGE, Math.max(EDGE, view.width - card.width - EDGE));
  const inY = (y: number) => clamp(y, EDGE, Math.max(EDGE, view.height - card.height - EDGE));
  if (!target) {
    return { left: inX((view.width - card.width) / 2), top: inY((view.height - card.height) / 2) };
  }
  const midX = inX(target.left + (target.width - card.width) / 2);
  const midY = inY(target.top + (target.height - card.height) / 2);
  const below = target.top + target.height + GAP;
  if (below + card.height <= view.height - EDGE) return { left: midX, top: below };
  const above = target.top - GAP - card.height;
  if (above >= EDGE) return { left: midX, top: above };
  const right = target.left + target.width + GAP;
  if (right + card.width <= view.width - EDGE) return { left: right, top: midY };
  const left = target.left - GAP - card.width;
  if (left >= EDGE) return { left, top: midY };
  return { left: midX, top: inY(view.height - card.height - EDGE) };
}
