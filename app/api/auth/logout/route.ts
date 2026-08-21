import { NextRequest, NextResponse } from 'next/server';
import { assertSameOriginMutation } from '@/src/lib/http-security';

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
  } catch {
    return new NextResponse('Request rejected', { status: 400 });
  }

  const response = NextResponse.redirect(new URL('/login', request.url), 303);
  response.headers.set('cache-control', 'no-store');
  response.cookies.set('kmf_session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  });
  return response;
}
