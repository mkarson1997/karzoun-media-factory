import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { consumeRateLimit, requestClientKey } from '@/src/lib/rate-limit';
import { deriveSessionToken } from '@/src/lib/session-token';

function safeNextPath(value: string) {
  return value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : '/dashboard';
}

function configuredBaseUrl() {
  const raw = process.env.APP_BASE_URL;
  if (!raw) throw new Error('APP_BASE_URL is not configured');
  const url = new URL(raw);
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error('APP_BASE_URL must use HTTPS in production');
  }
  if (url.username || url.password) throw new Error('APP_BASE_URL cannot contain credentials');
  return url;
}

function safeSecretEqual(supplied: string, configured: string) {
  const left = Buffer.from(supplied, 'utf8');
  const right = Buffer.from(configured, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  const configured = process.env.APP_SECRET;
  if (!configured || configured.length < 32) {
    return new NextResponse('APP_SECRET must be configured with at least 32 characters.', { status: 503 });
  }

  let baseUrl: URL;
  try {
    baseUrl = configuredBaseUrl();
  } catch {
    return new NextResponse('APP_BASE_URL is not safely configured.', { status: 503 });
  }

  const client = requestClientKey(request.headers);
  const rate = consumeRateLimit(`login:${client}`, 10, 15 * 60_000);
  if (!rate.allowed) {
    return new NextResponse('Too many login attempts. Try again later.', {
      status: 429,
      headers: { 'retry-after': String(rate.retryAfterSeconds), 'cache-control': 'no-store' }
    });
  }

  const form = await request.formData();
  const supplied = String(form.get('secret') ?? '');
  const nextPath = safeNextPath(String(form.get('next') ?? '/dashboard'));

  if (!safeSecretEqual(supplied, configured)) {
    const target = new URL('/login', baseUrl);
    target.searchParams.set('error', '1');
    target.searchParams.set('next', nextPath);
    return NextResponse.redirect(target, 303);
  }

  const response = NextResponse.redirect(new URL(nextPath, baseUrl), 303);
  response.headers.set('cache-control', 'no-store');
  response.cookies.set('kmf_session', await deriveSessionToken(configured), {
    httpOnly: true,
    secure: baseUrl.protocol === 'https:',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30
  });
  return response;
}
