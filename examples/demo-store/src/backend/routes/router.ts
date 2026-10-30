// A small router: exact method + path match, app-wide middleware, then the route's own chain.
import { type Handler, json, type Middleware, type RequestContext } from '../app/http.ts';

interface Route {
  method: string;
  path: string;
  middleware: Middleware[];
  handler: Handler;
}

function runChain(
  ctx: RequestContext,
  middleware: readonly Middleware[],
  handler: Handler,
  index = 0,
): Promise<Response> {
  const current = middleware[index];
  if (!current) return Promise.resolve(handler(ctx));
  return Promise.resolve(current(ctx, () => runChain(ctx, middleware, handler, index + 1)));
}

export class Router {
  private readonly routes: Route[] = [];
  private readonly global: Middleware[] = [];

  /** Middleware that runs for every matched route, before the route's own chain. */
  use(middleware: Middleware): void {
    this.global.push(middleware);
  }

  add(method: string, path: string, middleware: Middleware[], handler: Handler): void {
    this.routes.push({ method, path, middleware, handler });
  }

  dispatch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    const route = this.routes.find((r) => r.method === request.method && r.path === path);
    if (!route) return Promise.resolve(json(404, { error: `No route for ${request.method} ${path}` }));
    const ctx: RequestContext = { request };
    return runChain(ctx, [...this.global, ...route.middleware], route.handler);
  }
}
