import { describe, expect, it } from 'vitest';

import { placeCard } from './placement.ts';

const VIEW = { width: 1000, height: 800 };
const CARD = { width: 300, height: 200 };

describe('placeCard', () => {
  it('centres the card when there is no target', () => {
    expect(placeCard(null, CARD, VIEW)).toEqual({ left: 350, top: 300 });
  });

  it('goes below a target near the top, centred on it', () => {
    const target = { left: 400, top: 20, width: 200, height: 40 };
    expect(placeCard(target, CARD, VIEW)).toEqual({ left: 350, top: 72 });
  });

  it('goes above a target near the bottom', () => {
    const target = { left: 400, top: 700, width: 200, height: 60 };
    expect(placeCard(target, CARD, VIEW)).toEqual({ left: 350, top: 488 });
  });

  it('goes beside a tall target when there is no room above or below', () => {
    const target = { left: 20, top: 100, width: 200, height: 600 };
    expect(placeCard(target, CARD, VIEW)).toEqual({ left: 232, top: 300 });
    const onTheRight = { left: 780, top: 100, width: 200, height: 600 };
    expect(placeCard(onTheRight, CARD, VIEW)).toEqual({ left: 468, top: 300 });
  });

  it('sits over the lower part of a target that fills the screen', () => {
    const target = { left: 0, top: 0, width: 1000, height: 800 };
    expect(placeCard(target, CARD, VIEW)).toEqual({ left: 350, top: 592 });
  });

  it('stays on screen wherever the target is, on a phone too', () => {
    const phone = { width: 360, height: 640 };
    const wide = { width: 344, height: 260 };
    for (const left of [-100, 0, 100, 300, 500]) {
      for (const top of [-100, 0, 300, 600, 900]) {
        const place = placeCard({ left, top, width: 80, height: 40 }, wide, phone);
        expect(place.left).toBeGreaterThanOrEqual(8);
        expect(place.left + wide.width).toBeLessThanOrEqual(phone.width - 8);
        expect(place.top).toBeGreaterThanOrEqual(8);
        expect(place.top + wide.height).toBeLessThanOrEqual(phone.height - 8);
      }
    }
  });
});
