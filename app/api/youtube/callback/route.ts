import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { exchangeYouTubeAuthorizationCode } from '@/src/lib/youtube-auth';
import { prisma } from '@/src/lib/prisma';

function equalState(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function redirectAndClear(next: URL) {
  const response = NextResponse.redirect(next);
  response.cookies.delete('youtube_oauth_state');
  response.cookies.delete('youtube_oauth_channel');
  return response;
}

export async function GET(request: NextRequest) {
  const next = new URL('/settings', request.url);
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const error = request.nextUrl.searchParams.get('error');
  const expectedState = request.cookies.get('youtube_oauth_state')?.value;
  const factoryChannelId = request.cookies.get('youtube_oauth_channel')?.value;

  if (error) {
    next.searchParams.set('youtube', 'denied');
    return redirectAndClear(next);
  }
  if (!code || !state || !expectedState || !equalState(state, expectedState) || !factoryChannelId) {
    next.searchParams.set('youtube', 'state-error');
    return redirectAndClear(next);
  }

  const factoryChannel = await prisma.channel.findUnique({ where: { id: factoryChannelId } });
  if (!factoryChannel || !factoryChannel.enabled) {
    next.searchParams.set('youtube', 'channel-error');
    return redirectAndClear(next);
  }

  try {
    const client = await exchangeYouTubeAuthorizationCode(code, factoryChannel.id);
    const youtube = (await import('googleapis')).google.youtube({ version: 'v3', auth: client });
    const channelResponse = await youtube.channels.list({ part: ['snippet'], mine: true });
    const channel = channelResponse.data.items?.[0];
    if (!channel?.id) throw new Error('Connected Google account did not expose a YouTube channel');

    await prisma.channel.update({
      where: { id: factoryChannel.id },
      data: { externalChannelId: channel.id }
    });
    await prisma.activityLog.create({
      data: {
        actor: 'oauth',
        action: 'YOUTUBE_CHANNEL_CONNECTED',
        entityType: 'Channel',
        entityId: factoryChannel.id,
        metadata: {
          factoryChannelName: factoryChannel.name,
          factoryChannelType: factoryChannel.type,
          youtubeChannelId: channel.id,
          youtubeChannelTitle: channel.snippet?.title ?? null
        }
      }
    });

    next.searchParams.set('youtube', 'connected');
    next.searchParams.set('channelId', factoryChannel.id);
    return redirectAndClear(next);
  } catch {
    next.searchParams.set('youtube', 'exchange-error');
    return redirectAndClear(next);
  }
}
