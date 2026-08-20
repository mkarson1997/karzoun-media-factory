import { NextRequest, NextResponse } from 'next/server';

async function digest(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === '/login' || pathname === '/api/auth/login' || pathname === '/api/health' || pathname.startsWith('/_next/') || pathname.startsWith('/demo/')) {
    return NextResponse.next();
  }

  const secret = process.env.APP_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      return new NextResponse('APP_SECRET must be configured before exposing the dashboard.', { status: 503 });
    }
    return NextResponse.next();
  }

  const expected = await digest(`kmf:${secret}`);
  if (request.cookies.get('kmf_session')?.value === expected) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  }

  const login = new URL('/login', request.url);
  login.searchParams.set('next', pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/((?!favicon.ico).*)']
};
