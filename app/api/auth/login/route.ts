import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export async function POST(request: NextRequest) {
  const configured = process.env.APP_SECRET;
  if (!configured) return new NextResponse('APP_SECRET is not configured.', { status: 503 });

  const form = await request.formData();
  const supplied = String(form.get('secret') ?? '');
  const nextPath = String(form.get('next') ?? '/dashboard');
  const left = Buffer.from(hash(supplied));
  const right = Buffer.from(hash(configured));
  const valid = left.length === right.length && timingSafeEqual(left, right);

  if (!valid) {
    const target = new URL('/login', request.url);
    target.searchParams.set('error', '1');
    target.searchParams.set('next', nextPath.startsWith('/') ? nextPath : '/dashboard');
    return NextResponse.redirect(target, 303);
  }

  const response = NextResponse.redirect(new URL(nextPath.startsWith('/') ? nextPath : '/dashboard', request.url), 303);
  response.cookies.set('kmf_session', hash(`kmf:${configured}`), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30
  });
  return response;
}
