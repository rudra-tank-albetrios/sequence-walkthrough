// Middleware: every response carries an X-Request-Id, reused from the request when it sent one.
import { randomUUID } from 'node:crypto';

import type { Middleware } from '../app/http.ts';

export const requestId: Middleware = async (ctx, next) => {
  const id = ctx.request.headers.get('x-request-id') ?? randomUUID();
  ctx.requestId = id;
  const response = await next();
  response.headers.set('X-Request-Id', id);
  return response;
};
