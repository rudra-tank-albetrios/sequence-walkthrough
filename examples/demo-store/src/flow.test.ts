// The demo flow must describe this code, so a newcomer reading it sees true behaviour. The flow is
// read as text, because the demo stands alone and does not use the viewer's parser.
// tools/check-refs proves every code link reaches a real line; these tests prove it is the right
// line, and that the payloads drawn in the flow are what the running code really sends.
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { createApp } from './backend/app/app.ts';
import { holdKey } from './backend/infra/stockKeys.ts';
import { DEMO_TOKEN, PRODUCTS } from './backend/seed.ts';

const PROJECT = new URL('../', import.meta.url);
const FLOW_LINES = readFileSync(new URL('flows/place-order.mmd', PROJECT), 'utf8')
  .split('\n')
  .map((line) => line.trim());

/** What each code link in the flow must land on, so a link cannot drift when the code moves. */
const LANDS_ON: Record<string, string> = {
  'src/frontend/hooks/useCart.ts:14': 'export function useCart',
  'src/frontend/pages/CheckoutPage.ts:16': 'renderOrderConfirmation(status.order)',
  'src/frontend/pages/CheckoutPage.ts:28': 'export function renderCheckoutPage',
  'src/frontend/pages/CheckoutPage.ts:44': 'export async function submitCheckout',
  'src/frontend/pages/CheckoutPage.ts:45': 'store.getState()',
  'src/frontend/pages/CheckoutPage.ts:47': 'api.placeOrder(',
  'src/frontend/pages/CheckoutPage.ts:55': 'items: []',
  'src/frontend/api/client.ts:36': "kind: 'placed'",
  'src/frontend/api/client.ts:60': '/api/orders',
  'src/frontend/components/OrderConfirmation.ts:5': 'export function renderOrderConfirmation',
  'src/frontend/components/OrderConfirmation.ts:11': 'Thank you! Order',
  'src/backend/app/app.ts:56': 'queue.enqueue(confirmationJob(event))',
  'src/backend/app/app.ts:73': 'db.sessions.findById(token)',
  'src/backend/app/app.ts:74': 'id: session.userId',
  'src/backend/app/app.ts:81': 'router.dispatch(request)',
  'src/backend/routes/orders.routes.ts:15': "'/api/orders', [requireUser",
  'src/backend/middleware/auth.middleware.ts:14': 'userFromHeader(',
  'src/backend/middleware/auth.middleware.ts:15': 'json(401',
  'src/backend/middleware/auth.middleware.ts:16-17': 'return next()',
  'src/backend/middleware/requestId.middleware.ts:10': "'X-Request-Id'",
  'src/backend/validators/placeOrder.validator.ts:62': 'validatePlaceOrder(',
  'src/backend/validators/placeOrder.validator.ts:63': 'json(422',
  'src/backend/validators/placeOrder.validator.ts:64': 'ctx.dto = result.dto',
  'src/backend/validators/placeOrder.validator.ts:65': 'return next()',
  'src/backend/dto/placeOrder.dto.ts:15': 'interface PlaceOrderDto',
  'src/backend/dto/placeOrder.dto.ts:30': 'interface OrderResponseDto',
  'src/backend/controllers/orders.controller.ts:21': 'this.orders.placeOrder(user, dto)',
  'src/backend/controllers/orders.controller.ts:22': 'serializeOrder(placed)',
  'src/backend/controllers/orders.controller.ts:25': 'json(409',
  'src/backend/services/orders.service.ts:86': 'orders.insert(order, items)',
  'src/backend/services/orders.service.ts:93': 'eventBus.publish(',
  'src/backend/services/orders.service.ts:101': 'return saved',
  'src/backend/services/orders.service.ts:106': 'products.findById(productId)',
  'src/backend/services/orders.service.ts:119': 'redis.reserve(',
  'src/backend/services/orders.service.ts:121-122': 'new OutOfStockError',
  'src/backend/services/orders.service.ts:130': 'redis.del(holdKey',
  'src/backend/repositories/products.repository.ts:12': 'findById(id: string)',
  'src/backend/repositories/orders.repository.ts:19': 'this.db.transaction(',
  'src/backend/repositories/orders.repository.ts:21': 'return { order, items',
  'src/backend/serializers/order.serializer.ts:6': 'export function serializeOrder',
  'src/backend/serializers/order.serializer.ts:7': 'return {',
  'src/backend/infra/memoryDb.ts:20': 'return row',
  'src/backend/infra/memoryRedis.ts:57': 'reserve(stockKey',
  'src/backend/infra/memoryRedis.ts:59': 'return false',
  'src/backend/infra/memoryRedis.ts:62': 'return true',
  'src/backend/infra/memoryQueue.ts:10': 'dequeue()',
  'src/backend/infra/mailer.ts:19': 'send(to: string',
  'src/backend/workers/orderConfirmation.worker.ts:16': 'export function confirmationJob',
  'src/backend/workers/orderConfirmation.worker.ts:38': 'this.queue.dequeue()',
  'src/backend/workers/orderConfirmation.worker.ts:41': 'this.mailer.send(',
  'src/backend/config/config.ts:18': 'RESERVATION_TTL_SECONDS',
  'src/backend/cron/releaseExpiredReservations.cron.ts:14': 'tick(now: number)',
  'src/backend/utils/money.ts:16': 'export function formatMoney',
  'src/backend/utils/money.ts:24': 'export function sumLines',
};

function codeAt(link: string): string {
  const [file = '', range = ''] = link.split(':');
  const [from = 0, to = from] = range.split('-').map(Number);
  const lines = readFileSync(new URL(file, PROJECT), 'utf8').split('\n');
  return lines.slice(from - 1, to).join('\n');
}

/** The values of one tag in the comment lines right above an arrow. */
function tagsAbove(arrow: string, tag: string): string[] {
  const at = FLOW_LINES.indexOf(arrow);
  if (at < 0) throw new Error(`The flow has no arrow "${arrow}"`);
  const found: string[] = [];
  for (let i = at - 1; FLOW_LINES[i]?.startsWith('%%'); i -= 1) {
    const value = new RegExp(`^%% @${tag} (.+)$`).exec(FLOW_LINES[i] ?? '')?.[1];
    if (value !== undefined) found.unshift(value);
  }
  return found;
}

function jsonAbove(arrow: string, tag: string): unknown {
  const [value] = tagsAbove(arrow, tag);
  if (value === undefined) throw new Error(`"${arrow}" has no @${tag}`);
  return JSON.parse(value) as unknown;
}

const orderBody = jsonAbove('API->>APP: POST /api/orders', 'payload.body');

function post(body: unknown, token?: string): Request {
  return new Request('http://demo.local/api/orders', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });
}

describe('the flow matches the code', () => {
  it('every code link lands on the code the step talks about', () => {
    const links = FLOW_LINES.flatMap((line) => {
      const link = /^%% @(?:ref|uses \S+ \S+) (\S+:\d+(?:-\d+)?)/.exec(line)?.[1];
      return link === undefined ? [] : [link];
    });
    expect([...new Set(links)].sort()).toEqual(Object.keys(LANDS_ON).sort());
    for (const [link, expected] of Object.entries(LANDS_ON)) {
      expect(codeAt(link), link).toContain(expected);
    }
  });

  it('the success reply is the one drawn, with the stock kept and the hold gone', async () => {
    const app = createApp({ now: () => Date.UTC(2026, 0, 1) });
    const response = await app.handle(post(orderBody, DEMO_TOKEN));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(jsonAbove('APP-->>API: 201 Created', 'payload.body'));

    const [event] = app.eventBus.published;
    expect(event).toEqual({
      ...(jsonAbove('SVC->>EB: publish order.placed', 'payload.event') as object),
      orderId: event?.orderId,
    });
    expect(app.redis.get('stock:p_1')).toBe('9');
    expect(app.redis.get(holdKey(event?.orderId ?? '', 'p_1'))).toBeNull();
  });

  it('the 401 reply is the one drawn', async () => {
    const response = await createApp().handle(post(orderBody));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(
      jsonAbove('APP-->>API: 401 Unauthorized', 'payload.body'),
    );
  });

  it('the 422 reply is the one drawn', async () => {
    const body = {
      items: [{ productId: 'p_1', quantity: 0 }],
      shippingAddress: { line1: '1 Lovelace Lane', city: '', postcode: '411001' },
    };
    const response = await createApp().handle(post(body, DEMO_TOKEN));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual(
      jsonAbove('APP-->>API: 422 Unprocessable Entity', 'payload.body'),
    );
  });

  it('the 409 reply is the one drawn', async () => {
    const app = createApp();
    const posterOnly = {
      items: [{ productId: 'p_3', quantity: 1 }],
      shippingAddress: { line1: '1 Lovelace Lane', city: 'Pune', postcode: '411001' },
    };
    expect((await app.handle(post(posterOnly, DEMO_TOKEN))).status).toBe(201);
    const response = await app.handle(post(posterOnly, DEMO_TOKEN));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual(jsonAbove('APP-->>API: 409 Conflict', 'payload.body'));
  });

  it('every @schema rule is a message the validator really gives', async () => {
    const app = createApp();
    const fieldsOf = async (body: unknown) => {
      const reply = (await (await app.handle(post(body, DEMO_TOKEN))).json()) as {
        fields: Record<string, string>;
      };
      return reply.fields;
    };
    const fields = {
      ...(await fieldsOf({ items: [] })),
      ...(await fieldsOf({ items: [{ productId: '', quantity: 0 }], shippingAddress: {} })),
    };
    const rules = tagsAbove('VAL->>VAL: validatePlaceOrder(body)', 'schema').map((rule) => {
      const [, path = '', message = ''] = /^(\S+) .+ → 422 "(.+)"$/.exec(rule) ?? [];
      return [path.replace('<i>', '0'), message];
    });
    expect(Object.fromEntries(rules)).toEqual(fields);
  });

  it('the queued job and the email are the ones drawn', async () => {
    const app = createApp({ now: () => Date.UTC(2026, 0, 1) });
    await app.handle(post(orderBody, DEMO_TOKEN));

    const job = app.queue.dequeue();
    expect(job).toEqual(jsonAbove('EB->>Q: enqueue(confirmationJob)', 'payload.event'));
    if (job) app.queue.enqueue(job);
    expect(app.worker.runOnce()).toBe(true);

    const [mail] = app.mailer.sent;
    expect(tagsAbove('WK->>MAIL: send(to, subject, text)', 'payload.body')).toEqual([
      `To: ${mail?.to ?? ''}, Subject: ${mail?.subject ?? ''}, Text: ${mail?.text ?? ''}`,
    ]);
  });

  it('the product row and the token in the flow are the seeded ones', () => {
    const [keyboard] = PRODUCTS;
    expect(jsonAbove('REPO-->>SVC: product rows', 'payload.result')).toEqual(keyboard);
    expect(tagsAbove('API->>APP: POST /api/orders', 'payload.headers')).toContain(
      `Authorization: Bearer ${DEMO_TOKEN}`,
    );
  });
});
