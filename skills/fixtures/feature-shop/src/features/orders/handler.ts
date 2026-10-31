import type { Context } from 'hono';

import { placeOrder } from './logic.ts';
import { toOrderView } from './view.ts';

export function placeOrderHandler(c: Context) {
  const order = placeOrder(c.get('customer'), c.get('body'));
  return c.json(toOrderView(order), 201);
}
