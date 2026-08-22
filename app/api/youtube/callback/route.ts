import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { exchangeYouTubeAuthorizationCode } from '@/src/lib/youtube-auth';
import { prisma } from '@/src/lib/prisma';

function equalState(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function factoryUrl(path: string) {
  const baseUrl = process.env.APP_BASE_URL;
  if (!baseUrl) throw new Error('APP_BASE_URL is required for OAuth redirects');
  return new URL(path, baseUrl);
}

function redirectAndClear(next: URL) {
  const response = NextResponse.redirect(next);
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
  const settings = factoryUrl('/settings');
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const error = request.nextUrl.searchParams.get('error');
  const expectedState = request.cookies.get('youtube_oauth_state')?.value;
  const factoryChannelId = request.cookies.get('youtube_oauth_channel')?.value;

  if (error) {
    settings.searchParams.set('youtube', 'denied');
    return redirectAndClear(settings);
  }
  if (!code || !state || !expectedState || !equalState(state, expectedState) || !factoryChannelId) {
    settings.searchParams.set('youtube', 'state-error');
    return redirectAndClear(settings);
  }

  const factoryChannel = await prisma.channel.findUnique({ where: { id: factoryChannelId } });
  if (!factoryChannel || !factoryChannel.enabled) {
    settings.searchParams.set('youtube', 'channel-error');
    return redirectAndClear(settings);
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
      settings.searchParams.set('youtube', 'connected');
      settings.searchParams.set('channelId', factoryChannel.id);
      return redirectAndClear(settings);
    }

    const select = factoryUrl('/youtube/select');
    select.searchParams.set('channelId', factoryChannel.id);
    return redirectAndClear(select);
  } catch {
    settings.searchParams.set('youtube', 'exchange-error');
    return redirectAndClear(settings);
  }
}
