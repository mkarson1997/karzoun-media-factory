import { NextRequest, NextResponse } from 'next/server';
import { deriveSessionToken } from './src/lib/session-token';

function loginUrl(request: NextRequest) {
  const configured = process.env.APP_BASE_URL;
  if (configured) {
    try {
      const base = new URL(configured);
      if (!base.username && !base.password && (base.protocol === 'https:' || process.env.NODE_ENV !== 'production')) {
        return new URL('/login', base);
      }
    } catch {
      // Fail closed below in production; development may use the request origin.
    }
  }
  return new URL('/login', request.url);
}

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

  if (process.env.NODE_ENV === 'production' && !process.env.APP_BASE_URL) {
    return new NextResponse('APP_BASE_URL must be configured before exposing the dashboard.', { status: 503 });
  }

  const login = loginUrl(request);
  login.searchParams.set('next', pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/((?!favicon.ico).*)']
};
