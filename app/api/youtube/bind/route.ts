import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';
import { trustedAppUrl } from '@/src/lib/app-origin';
import { assertSameOriginMutation } from '@/src/lib/http-security';
import { prisma } from '@/src/lib/prisma';
import { getAuthorizedYouTubeClient } from '@/src/lib/youtube-auth';

export async function POST(request: NextRequest) {
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

    return NextResponse.redirect(trustedAppUrl(`/settings?youtube=connected&channelId=${encodeURIComponent(factoryChannel.id)}`), 303);
  } catch {
    try {
      return NextResponse.redirect(trustedAppUrl('/settings?youtube=bind-error'), 303);
    } catch {
      return new NextResponse('APP_BASE_URL is not safely configured.', { status: 503 });
    }
  }
}
