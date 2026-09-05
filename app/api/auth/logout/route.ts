import { NextRequest, NextResponse } from 'next/server';
import { trustedAppBaseUrl, trustedAppUrl } from '@/src/lib/app-origin';
import { assertSameOriginMutation } from '@/src/lib/http-security';

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
  } catch {
    return new NextResponse('Request rejected', { status: 400 });
  }

  let baseUrl: URL;
  try {
    baseUrl = trustedAppBaseUrl();
  } catch {
    return new NextResponse('APP_BASE_URL is not safely configured.', { status: 503 });
  }

  const response = NextResponse.redirect(trustedAppUrl('/login'), 303);
  response.headers.set('cache-control', 'no-store');
  response.cookies.set('kmf_session', '', {
    httpOnly: true,
    secure: baseUrl.protocol === 'https:',
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  });
  return response;
}
