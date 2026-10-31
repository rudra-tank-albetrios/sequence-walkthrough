import type { MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ZodType } from 'zod';

export function parseBody(schema: ZodType): MiddlewareHandler {
  return async (c, next) => {
    const parsed = schema.safeParse(await c.req.json());
    if (!parsed.success) {
      throw new HTTPException(422, { message: 'The order is not complete' });
    }
    c.set('body', parsed.data);
    await next();
  };
}
