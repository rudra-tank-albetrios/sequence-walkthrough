import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

import { ordersRoutes } from './features/orders/routes.ts';
import { profileRoutes } from './features/profile/routes.ts';

export const server = new Hono();

server.route('/v2/orders', ordersRoutes);
server.route('/v2/profile', profileRoutes);

server.onError((error, c) => {
  if (error instanceof HTTPException) {
    return c.json({ problem: error.message }, error.status);
  }
  return c.json({ problem: 'Unexpected error' }, 500);
});
