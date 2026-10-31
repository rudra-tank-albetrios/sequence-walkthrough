import { DEFAULT_DIAGRAM } from '../../shared/lib/defaultDiagram.ts';
import { Store } from '../../shared/storage/store.ts';

/** `swv:tour:seen`: this browser has had its tour, so it does not start by itself again. */
export const TOUR_SEEN_KEY = 'swv:tour:seen';

export function markTourSeen(): void {
  Store.set(TOUR_SEEN_KEY, true);
}

/**
 * The tour starts by itself once, on a plain visit to the demo flow. A shared link goes straight to
 * what it shares, a person's own saved code stays in front, and a browser that cannot store
 * anything would otherwise get the tour on every visit. The button works in all of these cases.
 */
export function shouldStartByItself(code: string, hash: string): boolean {
  return (
    code === DEFAULT_DIAGRAM &&
    hash.length <= 1 &&
    Store.ok &&
    !Store.get<boolean>(TOUR_SEEN_KEY, false)
  );
}
