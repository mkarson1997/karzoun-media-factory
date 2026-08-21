import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';
import { assertSameOriginMutation } from '@/src/lib/http-security';
import { prisma } from '@/src/lib/prisma';
import { getAuthorizedYouTubeClient } from '@/src/lib/youtube-auth';

export async function POST(request: NextRequest) {
  const settings = new URL('/settings', request.url);
  try {
    assertSameOriginMutation(request);
    const form = await request.formData();
    const factoryChannelId = String(form.get('factoryChannelId') ?? '');
    const youtubeChannelId = String(form.get('youtubeChannelId') ?? '');
    if (!factoryChannelId || !youtubeChannelId) throw new Error('Missing channel binding values');

    const factoryChannel = await prisma.channel.findUnique({ where: { id: factoryChannelId } });
    if (!factoryChannel || !factoryChannel.enabled) throw new Error('Factory channel unavailable');

    const auth = await getAuthorizedYouTubeClient(factoryChannel.id);
    const youtube = google.youtube({ version: 'v3', auth });
    const mine = await youtube.channels.list({ part: ['snippet'], mine: true, maxResults: 50 });
    const selected = (mine.data.items ?? []).find((item) => item.id === youtubeChannelId);
    if (!selected?.id) throw new Error('Selected YouTube channel is not available to this authorization');

    await prisma.channel.update({ where: { id: factoryChannel.id }, data: { externalChannelId: selected.id } });
    await prisma.activityLog.create({
      data: {
        actor: 'oauth',
        action: 'YOUTUBE_CHANNEL_CONNECTED',
        entityType: 'Channel',
        entityId: factoryChannel.id,
        metadata: {
          factoryChannelName: factoryChannel.name,
          factoryChannelType: factoryChannel.type,
          youtubeChannelId: selected.id,
          youtubeChannelTitle: selected.snippet?.title ?? null,
          explicitSelection: true
        }
      }
    });

    settings.searchParams.set('youtube', 'connected');
    settings.searchParams.set('channelId', factoryChannel.id);
    return NextResponse.redirect(settings, 303);
  } catch {
    settings.searchParams.set('youtube', 'bind-error');
    return NextResponse.redirect(settings, 303);
  }
}
