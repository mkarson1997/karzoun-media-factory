import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { trustedAppUrl } from '@/src/lib/app-origin';
import { exchangeYouTubeAuthorizationCode } from '@/src/lib/youtube-auth';
import { prisma } from '@/src/lib/prisma';

function equalState(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function redirectAndClear(pathname: string, params?: Record<string, string>) {
  const target = trustedAppUrl(pathname);
  for (const [key, value] of Object.entries(params ?? {})) target.searchParams.set(key, value);
  const response = NextResponse.redirect(target);
  response.cookies.delete('youtube_oauth_state');
  response.cookies.delete('youtube_oauth_channel');
  return response;
}

async function bindChannel(factoryChannelId: string, youtubeChannelId: string, youtubeChannelTitle?: string | null) {
  const factoryChannel = await prisma.channel.findUnique({ where: { id: factoryChannelId } });
  if (!factoryChannel || !factoryChannel.enabled) throw new Error('Factory channel is unavailable');

  await prisma.channel.update({
    where: { id: factoryChannel.id },
    data: { externalChannelId: youtubeChannelId }
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
        youtubeChannelId,
        youtubeChannelTitle: youtubeChannelTitle ?? null
      }
    }
  });
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const error = request.nextUrl.searchParams.get('error');
  const expectedState = request.cookies.get('youtube_oauth_state')?.value;
  const factoryChannelId = request.cookies.get('youtube_oauth_channel')?.value;

  if (error) return redirectAndClear('/settings', { youtube: 'denied' });
  if (!code || !state || !expectedState || !equalState(state, expectedState) || !factoryChannelId) {
    return redirectAndClear('/settings', { youtube: 'state-error' });
  }

  const factoryChannel = await prisma.channel.findUnique({ where: { id: factoryChannelId } });
  if (!factoryChannel || !factoryChannel.enabled) {
    return redirectAndClear('/settings', { youtube: 'channel-error' });
  }

  try {
    const client = await exchangeYouTubeAuthorizationCode(code, factoryChannel.id);
    const youtube = (await import('googleapis')).google.youtube({ version: 'v3', auth: client });
    const channelResponse = await youtube.channels.list({ part: ['snippet'], mine: true, maxResults: 50 });
    const channels = (channelResponse.data.items ?? []).filter((item) => Boolean(item.id));

    if (channels.length === 0) throw new Error('Connected Google account did not expose a YouTube channel');

    if (channels.length === 1) {
      const channel = channels[0];
      await bindChannel(factoryChannel.id, channel.id!, channel.snippet?.title);
      return redirectAndClear('/settings', { youtube: 'connected', channelId: factoryChannel.id });
    }

    return redirectAndClear('/youtube/select', { channelId: factoryChannel.id });
  } catch {
    return redirectAndClear('/settings', { youtube: 'exchange-error' });
  }
}
