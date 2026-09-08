import { NextRequest, NextResponse } from 'next/server';
import { trustedAppUrl } from './src/lib/app-origin';
import { deriveSessionToken } from './src/lib/session-token';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    pathname === '/login' ||
    pathname === '/api/auth/login' ||
    pathname === '/api/health' ||
    pathname === '/api/readiness' ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/demo/')
  ) {
    return NextResponse.next();
  }

  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      return new NextResponse('APP_SECRET must be configured with at least 32 characters before exposing the dashboard.', { status: 503 });
    }
    return NextResponse.next();
  }

  const expected = await deriveSessionToken(secret);
  if (request.cookies.get('kmf_session')?.value === expected) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  }

  let login: URL;
  try {
    login = trustedAppUrl('/login');
  } catch {
    return new NextResponse('APP_BASE_URL must be safely configured before exposing the dashboard.', { status: 503 });
  }
  login.searchParams.set('next', pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/((?!favicon.ico).*)']
};
