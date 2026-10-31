import { HTTPException } from 'hono/http-exception';

import { insertOrder, readStock } from './store.ts';

export function placeOrder(customer: string, body: { item: string; count: number }) {
  const stock = readStock(body.item);
  if (!stock || stock.remaining < body.count) {
    throw new HTTPException(409, { message: 'Out of stock' });
  }
  return insertOrder(customer, body.item, body.count, stock.unit_price * body.count);
}
