// Middleware: turns "Authorization: Bearer <token>" into the signed-in user, or stops with 401.
import { type AuthUser, json, type Middleware } from '../app/http.ts';

export type SessionLookup = (token: string) => AuthUser | undefined;

function userFromHeader(header: string | null, findSession: SessionLookup): AuthUser | undefined {
  const [scheme, token] = header?.split(' ') ?? [];
  if (scheme !== 'Bearer' || token === undefined || token === '') return undefined;
  return findSession(token);
}

export function requireUser(findSession: SessionLookup): Middleware {
  return (ctx, next) => {
    const user = userFromHeader(ctx.request.headers.get('authorization'), findSession);
    if (!user) return json(401, { error: 'Sign in to place an order' });
    ctx.user = user;
    return next();
  };
}
