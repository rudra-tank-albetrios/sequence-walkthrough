import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

import { readSession } from './session';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const session = readSession(request.headers.authorization);
    if (!session) {
      throw new UnauthorizedException('Invalid session');
    }
    request.user = session;
    return true;
  }
}
