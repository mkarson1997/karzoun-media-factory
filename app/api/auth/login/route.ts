import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { consumeRateLimit, requestClientKey } from '@/src/lib/rate-limit';

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function safeNextPath(value: string) {
  return value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : '/dashboard';
}

export async function POST(request: NextRequest) {
  const configured = process.env.APP_SECRET;
  if (!configured) return new NextResponse('APP_SECRET is not configured.', { status: 503 });

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
  const left = Buffer.from(hash(supplied));
  const right = Buffer.from(hash(configured));
  const valid = left.length === right.length && timingSafeEqual(left, right);

  if (!valid) {
    const target = new URL('/login', request.url);
    target.searchParams.set('error', '1');
    target.searchParams.set('next', nextPath);
    return NextResponse.redirect(target, 303);
  }

  const response = NextResponse.redirect(new URL(nextPath, request.url), 303);
  response.headers.set('cache-control', 'no-store');
  response.cookies.set('kmf_session', hash(`kmf:${configured}`), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30
  });
  return response;
}
