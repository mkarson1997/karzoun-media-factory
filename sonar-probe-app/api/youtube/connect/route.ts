import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { trustedAppBaseUrl, trustedAppUrl } from '@/src/lib/app-origin';
import { createYouTubeAuthorizationUrl } from '@/src/lib/youtube-auth';
import { prisma } from '@/src/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const requestedChannelId = request.nextUrl.searchParams.get('channelId');
    const channel = requestedChannelId
      ? await prisma.channel.findUnique({ where: { id: requestedChannelId } })
      : await prisma.channel.findFirst({ where: { type: 'GENERAL', enabled: true }, orderBy: { createdAt: 'asc' } });

    if (!channel || !channel.enabled) {
      return NextResponse.redirect(trustedAppUrl('/settings?youtube=channel-error'));
    }

    const state = randomBytes(24).toString('hex');
    const url = createYouTubeAuthorizationUrl(state);
    const response = NextResponse.redirect(url);
    const baseUrl = trustedAppBaseUrl();
    const cookieOptions = {
      httpOnly: true,
      secure: baseUrl.protocol === 'https:',
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 10 * 60
    };
    response.cookies.set('youtube_oauth_state', state, cookieOptions);
    response.cookies.set('youtube_oauth_channel', channel.id, cookieOptions);
    return response;
  } catch {
    try {
      return NextResponse.redirect(trustedAppUrl('/settings?youtube=configuration-error'));
    } catch {
      return new NextResponse('APP_BASE_URL is not safely configured.', { status: 503 });
    }
  }
}
