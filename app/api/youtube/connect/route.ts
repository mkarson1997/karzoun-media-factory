import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createYouTubeAuthorizationUrl } from '@/src/lib/youtube-auth';

export async function GET(request: NextRequest) {
  try {
    const state = randomBytes(24).toString('hex');
    const url = createYouTubeAuthorizationUrl(state);
    const response = NextResponse.redirect(url);
    response.cookies.set('youtube_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 10 * 60
    });
    return response;
  } catch {
    return NextResponse.redirect(new URL('/settings?youtube=configuration-error', request.url));
  }
}
