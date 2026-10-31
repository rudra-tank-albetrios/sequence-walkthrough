// Cron: a hold nobody confirmed, because the request died before the order was saved, goes back
// to the stock counter once its TTL ran out. A placed order has dropped its holds already.
import type { MemoryRedis } from '../infra/memoryRedis.ts';
import { HOLD_PREFIX, productIdFromHoldKey, stockKey } from '../infra/stockKeys.ts';

export class ReleaseExpiredReservationsCron {
  private readonly redis: MemoryRedis;

  constructor(redis: MemoryRedis) {
    this.redis = redis;
  }

  /** One pass at time `now` (ms since epoch). Returns how many holds went back to stock. */
  tick(now: number): number {
    const expired = this.redis.expired(HOLD_PREFIX, now);
    for (const { key, value } of expired) {
      const productId = productIdFromHoldKey(key);
      if (productId !== undefined) this.redis.release(stockKey(productId), key, Number(value));
    }
    return expired.length;
  }
}
