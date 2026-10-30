import { describe, expect, it } from 'vitest';

import { DEMO_TOKEN } from '../seed.ts';
import { createApp } from './app.ts';

const PLACED_AT = Date.UTC(2026, 0, 1);
const ADDRESS = { line1: '1 Lovelace Lane', city: 'Pune', postcode: '411001' };

function placeOrder(body: unknown, token?: string): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (token !== undefined) headers.set('authorization', `Bearer ${token}`);
  return new Request('http://demo.local/api/orders', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('POST /api/orders', () => {
  it('places an order: 201, stock held, event published, email sent by the worker', async () => {
    const app = createApp({ now: () => PLACED_AT });
    const body = { items: [{ productId: 'p_1', quantity: 1 }, { productId: 'p_2', quantity: 2 }], shippingAddress: ADDRESS };

    const response = await app.handle(placeOrder(body, DEMO_TOKEN));

    expect(response.status).toBe(201);
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(await response.json()).toEqual({
      orderNumber: 'SW-1001',
      status: 'placed',
      currency: 'INR',
      items: [
        { productId: 'p_1', name: 'Mechanical keyboard', quantity: 1, unitPrice: 499900, lineTotal: 499900 },
        { productId: 'p_2', name: 'USB-C cable', quantity: 2, unitPrice: 59900, lineTotal: 119800 },
      ],
      total: 619700,
      totalDisplay: '₹6197.00',
      shippingAddress: ADDRESS,
      placedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(app.redis.get('stock:p_1')).toBe('9');
    expect(app.redis.get('stock:p_2')).toBe('23');
    expect(app.db.orders.size).toBe(1);
    expect(app.db.orderItems.size).toBe(2);
    expect(app.eventBus.published).toMatchObject([
      { type: 'order.placed', orderNumber: 'SW-1001', email: 'ada@example.com', total: 619700 },
    ]);

    expect(app.queue.size).toBe(1);
    expect(app.worker.runOnce()).toBe(true);
    expect(app.mailer.sent).toHaveLength(1);
    expect(app.mailer.sent[0]).toMatchObject({ to: 'ada@example.com' });
    expect(app.mailer.sent[0]?.text).toContain('SW-1001');
    expect(app.worker.runOnce()).toBe(false);
  });

  it('rejects a request without a token with 401', async () => {
    const app = createApp();
    const response = await app.handle(placeOrder({ items: [{ productId: 'p_1', quantity: 1 }], shippingAddress: ADDRESS }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Sign in to place an order' });
  });

  it('rejects an unknown token with 401', async () => {
    const app = createApp();
    const response = await app.handle(placeOrder({}, 'not-a-session'));
    expect(response.status).toBe(401);
  });

  it('rejects a bad body with 422 and one message per field', async () => {
    const app = createApp();
    const body = { items: [{ productId: '', quantity: 1.5 }], shippingAddress: { line1: '1 Lovelace Lane' } };
    const response = await app.handle(placeOrder(body, DEMO_TOKEN));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: 'Order details are invalid',
      fields: {
        'items.0.productId': 'must be a non-empty string',
        'items.0.quantity': 'must be a whole number greater than 0',
        'shippingAddress.city': 'must be a non-empty string',
        'shippingAddress.postcode': 'must be a non-empty string',
      },
    });
    expect(app.db.orders.size).toBe(0);
  });

  it('answers 409 when the stock is gone, and gives earlier holds back', async () => {
    const app = createApp();
    const first = await app.handle(placeOrder({ items: [{ productId: 'p_3', quantity: 1 }], shippingAddress: ADDRESS }, DEMO_TOKEN));
    expect(first.status).toBe(201);

    const body = { items: [{ productId: 'p_1', quantity: 1 }, { productId: 'p_3', quantity: 1 }], shippingAddress: ADDRESS };
    const second = await app.handle(placeOrder(body, DEMO_TOKEN));
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: '"Limited edition poster" is out of stock', productId: 'p_3' });
    expect(app.redis.get('stock:p_1')).toBe('10');
    expect(app.db.orders.size).toBe(1);
  });

  it('answers 404 for a product that does not exist', async () => {
    const app = createApp();
    const response = await app.handle(placeOrder({ items: [{ productId: 'p_9', quantity: 1 }], shippingAddress: ADDRESS }, DEMO_TOKEN));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Product "p_9" does not exist', productId: 'p_9' });
  });
});
