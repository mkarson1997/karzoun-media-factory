import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createYouTubeAuthorizationUrl } from '@/src/lib/youtube-auth';
import { prisma } from '@/src/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const requestedChannelId = request.nextUrl.searchParams.get('channelId');
    const channel = requestedChannelId
      ? await prisma.channel.findUnique({ where: { id: requestedChannelId } })
      : await prisma.channel.findFirst({ where: { type: 'GENERAL', enabled: true }, orderBy: { createdAt: 'asc' } });

    if (!channel || !channel.enabled) {
      return NextResponse.redirect(new URL('/settings?youtube=channel-error', request.url));
    }

    const state = randomBytes(24).toString('hex');
    const url = createYouTubeAuthorizationUrl(state);
    const response = NextResponse.redirect(url);
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 10 * 60
    };
    response.cookies.set('youtube_oauth_state', state, cookieOptions);
    response.cookies.set('youtube_oauth_channel', channel.id, cookieOptions);
    return response;
  } catch {
    return NextResponse.redirect(new URL('/settings?youtube=configuration-error', request.url));
  }
}
