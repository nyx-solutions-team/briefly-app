import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const AUTH_COOKIE = 'docustore_auth_v1';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Allow next internals and static files
  // Also allow public share routes (no auth required)
  if (
    pathname.startsWith('/_next')
    || pathname.startsWith('/api')
    || pathname.startsWith('/favicon')
    || pathname.startsWith('/signin')
    || pathname.startsWith('/no-access')
    || pathname.startsWith('/ip-blocked')
    || pathname.startsWith('/share')
    || pathname.startsWith('/folder-share')
  ) {
    return NextResponse.next();
  }

  // Gate all other routes behind auth. Accept either our marker cookie or a Supabase session cookie.
  const cookieHeader = req.headers.get('cookie') || '';
  const hasAuth = req.cookies.get(AUTH_COOKIE) || cookieHeader.includes(AUTH_COOKIE) || cookieHeader.includes('sb-');
  if (!hasAuth) {
    const url = req.nextUrl.clone();
    url.pathname = '/signin';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

