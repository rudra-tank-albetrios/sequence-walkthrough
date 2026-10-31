import { describe, expect, it } from 'vitest';

import { createApp } from '../app/app.ts';
import { holdKey, stockKey } from '../infra/stockKeys.ts';
import { DEMO_TOKEN } from '../seed.ts';

const TTL_MS = 60_000;

function setup() {
  let clock = Date.UTC(2026, 0, 1);
  const app = createApp({ now: () => clock, env: { RESERVATION_TTL_SECONDS: '60' } });
  const passTtl = () => {
    clock += TTL_MS + 1000;
    return clock;
  };
  return { app, passTtl, now: () => clock };
}

describe('ReleaseExpiredReservationsCron', () => {
  it('gives an abandoned hold back to stock once it expires, and not before', () => {
    const { app, passTtl, now } = setup();
    // What a request that died between holding the stock and saving the order leaves behind.
    const reserved = app.redis.reserve(stockKey('p_3'), holdKey('died-order', 'p_3'), 1, 60);
    expect(reserved).toBe(true);
    expect(app.redis.get(stockKey('p_3'))).toBe('0');

    expect(app.cron.tick(now())).toBe(0);
    expect(app.redis.get(stockKey('p_3'))).toBe('0');

    expect(app.cron.tick(passTtl())).toBe(1);
    expect(app.redis.get(stockKey('p_3'))).toBe('1');
    expect(app.cron.tick(now())).toBe(0);
  });

  it('never gives back the stock of an order that was placed', async () => {
    const { app, passTtl } = setup();
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
    expect(app.redis.get(stockKey('p_3'))).toBe('0');

    expect(app.cron.tick(passTtl())).toBe(0);
    expect(app.redis.get(stockKey('p_3'))).toBe('0');
  });
});
