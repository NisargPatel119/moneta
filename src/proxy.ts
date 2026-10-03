import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  // If an APP_PASSWORD is set in our environment, we require it to access the app
  const appPassword = process.env.APP_PASSWORD;

  if (appPassword) {
    const basicAuth = req.headers.get('authorization');

    if (basicAuth) {
      const authValue = basicAuth.split(' ')[1];
      const [user, pwd] = atob(authValue).split(':');

      // Only check the password, any username works
      if (pwd === appPassword) {
        return NextResponse.next();
      }
    }

    // Prompt the browser's native login popup
    return new NextResponse('Authentication required', {
      status: 401,
      headers: {
        'WWW-Authenticate': `Basic realm="Secure WealthSync Dashboard"`,
      },
    });
  }

  return NextResponse.next();
}

// Run this on all routes except static files
export const config = {
  matcher: ['/((?!api/plaid|_next/static|_next/image|favicon.ico).*)'],
};
