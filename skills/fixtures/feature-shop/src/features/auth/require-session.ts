import type { MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';

const sessions = new Map<string, string>();

export const requireSession: MiddlewareHandler = async (c, next) => {
  const customer = sessions.get(c.req.header('x-session') ?? '');
  if (!customer) {
    throw new HTTPException(401, { message: 'No session' });
  }
  c.set('customer', customer);
  await next();
};
