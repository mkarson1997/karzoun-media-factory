import { google, type youtube_v3 } from 'googleapis';
import type { PublishingProvider, PublishingRequest, PublishingResult } from './providers';
import { assertRuntimePublishingCapacity } from './publishing-guard';
import { openSafeRemoteMedia } from './remote-media';
import { openLocalMedia } from './local-media';
import { getAuthorizedYouTubeClient } from './youtube-auth';
import { prisma } from './prisma';

function uploadsUnlocked() {
  if (process.env.ALLOW_YOUTUBE_UPLOAD !== 'true') {
    throw new Error('YouTube uploads are locked. Set ALLOW_YOUTUBE_UPLOAD=true only after a private upload test is intended');
  }
}

function normalizedVisibility(requested: PublishingRequest['visibility']): 'PRIVATE' | 'UNLISTED' | 'PUBLIC' {
  if (process.env.ALLOW_PUBLIC_PUBLISHING !== 'true') return 'PRIVATE';
  return requested;
}

function youtubeVisibility(value: 'PRIVATE' | 'UNLISTED' | 'PUBLIC') {
  return value.toLowerCase() as 'private' | 'unlisted' | 'public';
}

function factoryVisibility(value?: string | null): 'PRIVATE' | 'UNLISTED' | 'PUBLIC' {
  if (value === 'public') return 'PUBLIC';
  if (value === 'unlisted') return 'UNLISTED';
  return 'PRIVATE';
}

async function channelClient(factoryChannelId?: string) {
  if (!factoryChannelId) throw new Error('YouTube publishing requires a factory channel binding');
  const channel = await prisma.channel.findUnique({ where: { id: factoryChannelId } });
  if (!channel?.enabled || !channel.externalChannelId) throw new Error('YouTube is not connected for this channel');

  const auth = await getAuthorizedYouTubeClient(factoryChannelId);
  const youtube = google.youtube({ version: 'v3', auth });
  const mine = await youtube.channels.list({ part: ['id'], mine: true });
  const authorizedIds = new Set((mine.data.items ?? []).map((item) => item.id).filter((id): id is string => Boolean(id)));
  if (!authorizedIds.has(channel.externalChannelId)) {
    throw new Error('YouTube channel binding mismatch. Reconnect the intended channel before publishing');
  }
  return youtube;
}

async function insertVideo(youtube: youtube_v3.Youtube, input: PublishingRequest, visibility: 'PRIVATE' | 'UNLISTED' | 'PUBLIC', publishAt?: Date) {
  const media = input.videoUrl.startsWith('/api/media/')
    ? await openLocalMedia(input.videoUrl)
    : await openSafeRemoteMedia(input.videoUrl);
  return youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: input.title.slice(0, 100),
        description: input.description.slice(0, 5000),
        tags: input.tags?.map((tag) => tag.replace(/^#/, '')).filter(Boolean).slice(0, 15),
        categoryId: '22'
      },
      status: {
        privacyStatus: youtubeVisibility(visibility),
        publishAt: publishAt?.toISOString(),
        selfDeclaredMadeForKids: Boolean(input.madeForKids)
      }
    },
    media: { body: media.stream }
  });
}

export class YouTubePublishingProvider implements PublishingProvider {
  async uploadVideo(input: PublishingRequest): Promise<PublishingResult> {
    uploadsUnlocked();
    await assertRuntimePublishingCapacity();
    const visibility = normalizedVisibility(input.visibility);
    const youtube = await channelClient(input.factoryChannelId);
    const response = await insertVideo(youtube, input, visibility);

    if (!response.data.id) throw new Error('YouTube upload completed without a video ID');
    return { externalVideoId: response.data.id, status: 'PUBLISHED', visibility };
  }

  async scheduleVideo(input: PublishingRequest): Promise<PublishingResult> {
    uploadsUnlocked();
    await assertRuntimePublishingCapacity();
    if (!input.publishAt) {
      const visibility = normalizedVisibility(input.visibility);
      const youtube = await channelClient(input.factoryChannelId);
      const response = await insertVideo(youtube, input, visibility);
      if (!response.data.id) throw new Error('YouTube upload completed without a video ID');
      return { externalVideoId: response.data.id, status: 'PUBLISHED', visibility };
    }
    if (process.env.ALLOW_PUBLIC_PUBLISHING !== 'true' || input.visibility !== 'PUBLIC') {
      const youtube = await channelClient(input.factoryChannelId);
      const response = await insertVideo(youtube, { ...input, visibility: 'PRIVATE' }, 'PRIVATE');
      if (!response.data.id) throw new Error('YouTube upload completed without a video ID');
      return { externalVideoId: response.data.id, status: 'PUBLISHED', visibility: 'PRIVATE' };
    }

    const youtube = await channelClient(input.factoryChannelId);
    const response = await insertVideo(youtube, input, 'PRIVATE', input.publishAt);
    if (!response.data.id) throw new Error('YouTube scheduled upload completed without a video ID');
    return { externalVideoId: response.data.id, status: 'SCHEDULED', visibility: 'PRIVATE' };
  }

  async getVideoStatus(externalVideoId: string, factoryChannelId?: string): Promise<PublishingResult> {
    const youtube = await channelClient(factoryChannelId);
    const response = await youtube.videos.list({ part: ['status'], id: [externalVideoId] });
    const item = response.data.items?.[0];
    if (!item) throw new Error('YouTube video not found');
    return {
      externalVideoId,
      status: 'PUBLISHED',
      visibility: factoryVisibility(item.status?.privacyStatus)
    };
  }
}
