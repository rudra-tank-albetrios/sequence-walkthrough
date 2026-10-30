// The request context and handler types shared by routes, middleware and controllers,
// plus the one place that builds JSON responses.
import type { PlaceOrderDto } from '../dto/placeOrder.dto.ts';

export interface AuthUser {
  id: string;
  email: string;
}

export interface RequestContext {
  request: Request;
  /** Set by the request-id middleware. */
  requestId?: string;
  /** Set by requireUser. */
  user?: AuthUser;
  /** Set by the validator once the body passed every check. */
  dto?: PlaceOrderDto;
}

type Next = () => Promise<Response>;
export type Middleware = (ctx: RequestContext, next: Next) => Promise<Response> | Response;
export type Handler = (ctx: RequestContext) => Promise<Response> | Response;

const STATUS_TEXT: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  401: 'Unauthorized',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  500: 'Internal Server Error',
};

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: STATUS_TEXT[status] ?? '',
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
