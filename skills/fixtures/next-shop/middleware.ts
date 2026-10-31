import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  if (!request.cookies.get('session')) {
    return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  }
  return NextResponse.next();
}

export const config = { matcher: '/api/:path*' };
