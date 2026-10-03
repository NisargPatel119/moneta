import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session';

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Vercel Cron can't sign in; the cron route checks CRON_SECRET itself
  if (pathname.startsWith('/api/cron/')) {
    return NextResponse.next();
  }

  const isLoggedIn = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === '/login') {
    // Already signed in? Skip the login screen
    return isLoggedIn ? NextResponse.redirect(new URL('/', req.url)) : NextResponse.next();
  }

  if (isLoggedIn) {
    return NextResponse.next();
  }

  // API calls get a 401 instead of an HTML redirect
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.redirect(new URL('/login', req.url));
}

// Run this on all routes except static files
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
