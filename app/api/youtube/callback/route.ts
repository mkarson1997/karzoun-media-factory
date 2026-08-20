import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { exchangeYouTubeAuthorizationCode } from '@/src/lib/youtube-auth';
import { prisma } from '@/src/lib/prisma';

function equalState(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  const next = new URL('/settings', request.url);
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const error = request.nextUrl.searchParams.get('error');
  const expectedState = request.cookies.get('youtube_oauth_state')?.value;

  if (error) {
    next.searchParams.set('youtube', 'denied');
    return NextResponse.redirect(next);
  }
  if (!code || !state || !expectedState || !equalState(state, expectedState)) {
    next.searchParams.set('youtube', 'state-error');
    return NextResponse.redirect(next);
  }

  try {
    const client = await exchangeYouTubeAuthorizationCode(code);
    const youtube = (await import('googleapis')).google.youtube({ version: 'v3', auth: client });
    const channelResponse = await youtube.channels.list({ part: ['snippet'], mine: true });
    const channel = channelResponse.data.items?.[0];

    if (channel?.id) {
      await prisma.channel.updateMany({
        where: { name: 'Karzoun Media Lab', type: 'GENERAL' },
        data: { externalChannelId: channel.id }
      });
    }
    await prisma.activityLog.create({
      data: {
        actor: 'oauth',
        action: 'YOUTUBE_CONNECTED',
        entityType: 'Integration',
        entityId: 'youtube',
        metadata: { channelId: channel?.id ?? null, channelTitle: channel?.snippet?.title ?? null }
      }
    });

    next.searchParams.set('youtube', 'connected');
    const response = NextResponse.redirect(next);
    response.cookies.delete('youtube_oauth_state');
    return response;
  } catch {
    next.searchParams.set('youtube', 'exchange-error');
    return NextResponse.redirect(next);
  }
}
