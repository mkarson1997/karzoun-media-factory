import { google } from 'googleapis';
import type { PublishingProvider, PublishingRequest, PublishingResult } from './providers';
import { openSafeRemoteMedia } from './remote-media';
import { getAuthorizedYouTubeClient } from './youtube-auth';

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

export class YouTubePublishingProvider implements PublishingProvider {
  async uploadVideo(input: PublishingRequest): Promise<PublishingResult> {
    uploadsUnlocked();
    const visibility = normalizedVisibility(input.visibility);
    const auth = await getAuthorizedYouTubeClient();
    const youtube = google.youtube({ version: 'v3', auth });
    const media = await openSafeRemoteMedia(input.videoUrl);

    const response = await youtube.videos.insert({
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
          selfDeclaredMadeForKids: Boolean(input.madeForKids)
        }
      },
      media: { body: media.stream }
    });

    if (!response.data.id) throw new Error('YouTube upload completed without a video ID');
    return { externalVideoId: response.data.id, status: 'PUBLISHED', visibility };
  }

  async scheduleVideo(input: PublishingRequest): Promise<PublishingResult> {
    uploadsUnlocked();
    if (!input.publishAt) return this.uploadVideo(input);
    if (process.env.ALLOW_PUBLIC_PUBLISHING !== 'true' || input.visibility !== 'PUBLIC') {
      return this.uploadVideo({ ...input, visibility: 'PRIVATE' });
    }

    const auth = await getAuthorizedYouTubeClient();
    const youtube = google.youtube({ version: 'v3', auth });
    const media = await openSafeRemoteMedia(input.videoUrl);
    const response = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: input.title.slice(0, 100),
          description: input.description.slice(0, 5000),
          tags: input.tags?.map((tag) => tag.replace(/^#/, '')).filter(Boolean).slice(0, 15),
          categoryId: '22'
        },
        status: {
          privacyStatus: 'private',
          publishAt: input.publishAt.toISOString(),
          selfDeclaredMadeForKids: Boolean(input.madeForKids)
        }
      },
      media: { body: media.stream }
    });

    if (!response.data.id) throw new Error('YouTube scheduled upload completed without a video ID');
    return { externalVideoId: response.data.id, status: 'SCHEDULED', visibility: 'PRIVATE' };
  }

  async getVideoStatus(externalVideoId: string): Promise<PublishingResult> {
    const auth = await getAuthorizedYouTubeClient();
    const youtube = google.youtube({ version: 'v3', auth });
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
