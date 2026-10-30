// Redis stand-in: string values, TTLs in seconds, lazy expiry like the real thing.

interface Entry {
  value: string;
  expiresAt: number | null;
}

export interface ExpiredEntry {
  key: string;
  value: string;
}

export class MemoryRedis {
  private readonly entries = new Map<string, Entry>();
  private readonly now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  set(key: string, value: string | number, ttlSeconds?: number): void {
    const expiresAt = ttlSeconds === undefined ? null : this.now() + ttlSeconds * 1000;
    this.entries.set(key, { value: String(value), expiresAt });
  }

  get(key: string): string | null {
    return this.live(key)?.value ?? null;
  }

  del(key: string): boolean {
    return this.entries.delete(key);
  }

  expire(key: string, ttlSeconds: number): boolean {
    const entry = this.live(key);
    if (!entry) return false;
    entry.expiresAt = this.now() + ttlSeconds * 1000;
    return true;
  }

  /** Adds to a counter and keeps its TTL, as INCRBY does. A missing key counts as 0. */
  incrBy(key: string, amount: number): number {
    const entry = this.live(key);
    const next = Number(entry?.value ?? 0) + amount;
    this.entries.set(key, { value: String(next), expiresAt: entry?.expiresAt ?? null });
    return next;
  }

  decrBy(key: string, amount: number): number {
    return this.incrBy(key, -amount);
  }

  /**
   * Atomically moves `amount` units out of the stock counter into a hold key that
   * expires after `ttlSeconds`. Returns false, and changes nothing, when stock is short.
   */
  reserve(stockKey: string, holdKey: string, amount: number, ttlSeconds: number): boolean {
    const available = Number(this.get(stockKey) ?? 0);
    if (available < amount) return false;
    this.decrBy(stockKey, amount);
    this.set(holdKey, amount, ttlSeconds);
    return true;
  }

  /** Gives `amount` units back to the stock counter and drops the hold. */
  release(stockKey: string, holdKey: string, amount: number): void {
    this.incrBy(stockKey, amount);
    this.del(holdKey);
  }

  /** Keys under `prefix` whose TTL ran out at or before `at`, with their last value. */
  expired(prefix: string, at: number): ExpiredEntry[] {
    return [...this.entries]
      .filter(
        ([key, entry]) =>
          key.startsWith(prefix) && entry.expiresAt !== null && entry.expiresAt <= at,
      )
      .map(([key, entry]) => ({ key, value: entry.value }));
  }

  private live(key: string): Entry | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    // Expired entries are hidden, not deleted: the cron reads them through expired() to give held
    // stock back, so a get must never make one disappear.
    return entry.expiresAt !== null && entry.expiresAt <= this.now() ? undefined : entry;
  }
}
