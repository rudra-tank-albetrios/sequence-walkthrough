import { describe, expect, it } from 'vitest';

import { createApp } from '../app/app.ts';
import { DEMO_TOKEN } from '../seed.ts';

describe('ReleaseExpiredReservationsCron', () => {
  it('gives an expired hold back to stock, and leaves live holds alone', async () => {
    let clock = Date.UTC(2026, 0, 1);
    const app = createApp({ now: () => clock, env: { RESERVATION_TTL_SECONDS: '60' } });
    const response = await app.handle(
      new Request('http://demo.local/api/orders', {
        method: 'POST',
        headers: { authorization: `Bearer ${DEMO_TOKEN}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          items: [{ productId: 'p_3', quantity: 1 }],
          shippingAddress: { line1: '1 Lovelace Lane', city: 'Pune', postcode: '411001' },
        }),
      }),
    );
    expect(response.status).toBe(201);
    expect(app.redis.get('stock:p_3')).toBe('0');

    expect(app.cron.tick(clock)).toBe(0);
    expect(app.redis.get('stock:p_3')).toBe('0');

    clock += 61_000;
    expect(app.cron.tick(clock)).toBe(1);
    expect(app.redis.get('stock:p_3')).toBe('1');
    expect(app.cron.tick(clock)).toBe(0);
  });
});
