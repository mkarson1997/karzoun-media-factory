import type { JobStatus } from './job-state-machine';
import { assertPaidGenerationAllowed, effectiveVideoProvider } from './zero-cost';

export interface VideoGenerationRequest {
  jobId: string;
  externalJobId?: string;
  prompt: string;
  durationSeconds: number;
}

export interface VideoGenerationResult {
  providerJobId: string;
  status: JobStatus;
  videoUrl?: string;
  thumbnailUrl?: string;
  providerStatus?: string;
  providerMetadata?: Record<string, unknown>;
  actualDuration?: number;
  nextPollSeconds?: number;
  failureReason?: string;
}

export interface VideoGenerationProvider {
  generateVideo(input: VideoGenerationRequest): Promise<VideoGenerationResult>;
  getJobStatus(providerJobId: string): Promise<VideoGenerationResult>;
  cancelJob(providerJobId: string): Promise<void>;
}

export interface PublishingRequest {
  jobId: string;
  factoryChannelId?: string;
  videoUrl: string;
  title: string;
  description: string;
  publishAt?: Date;
  visibility: 'PRIVATE' | 'UNLISTED' | 'PUBLIC';
  madeForKids?: boolean;
  tags?: string[];
}

export interface PublishingResult {
  externalVideoId?: string;
  status: JobStatus;
  visibility?: 'PRIVATE' | 'UNLISTED' | 'PUBLIC';
}

export interface PublishingProvider {
  uploadVideo(input: PublishingRequest): Promise<PublishingResult>;
  scheduleVideo(input: PublishingRequest): Promise<PublishingResult>;
  getVideoStatus(externalVideoId: string, factoryChannelId?: string): Promise<PublishingResult>;
}

export class MockVideoProvider implements VideoGenerationProvider {
  async generateVideo(input: VideoGenerationRequest): Promise<VideoGenerationResult> {
    return {
      providerJobId: `mock-video-${input.jobId}`,
      status: 'GENERATING'
    };
  }

  async getJobStatus(providerJobId: string): Promise<VideoGenerationResult> {
    return {
      providerJobId,
      status: 'READY_FOR_REVIEW',
      thumbnailUrl: '/demo/sample-thumb.svg'
    };
  }

  async cancelJob(): Promise<void> {}
}

export async function getVideoGenerationProvider(name = process.env.VIDEO_PROVIDER || 'mock'): Promise<VideoGenerationProvider> {
  name = effectiveVideoProvider(name);
  assertPaidGenerationAllowed(name);
  if (name === 'local-demo' || name === 'local-ffmpeg') {
    const { LocalDemoVideoProvider } = await import('./local-demo-provider');
    return new LocalDemoVideoProvider();
  }
  if (name === 'mock' || name === 'mock-demo') return new MockVideoProvider();
  if (name === 'openart-mcp') {
    const { OpenArtMcpVideoProvider } = await import('./openart-mcp-provider');
    return new OpenArtMcpVideoProvider();
  }
  throw new Error(`Unsupported video provider: ${name}`);
}

export class MockPublishingProvider implements PublishingProvider {
  async uploadVideo(input: PublishingRequest): Promise<PublishingResult> {
    return { externalVideoId: `mock-youtube-${input.jobId}`, status: 'PUBLISHED', visibility: input.visibility };
  }

  async scheduleVideo(input: PublishingRequest): Promise<PublishingResult> {
    return { externalVideoId: `mock-youtube-${input.jobId}`, status: 'SCHEDULED', visibility: input.visibility };
  }

  async getVideoStatus(externalVideoId: string): Promise<PublishingResult> {
    return { externalVideoId, status: 'PUBLISHED', visibility: 'PRIVATE' };
  }
}

export async function getPublishingProvider(name = process.env.PUBLISHING_PROVIDER || 'mock'): Promise<PublishingProvider> {
  if (name === 'mock') return new MockPublishingProvider();
  if (name === 'youtube') {
    const { YouTubePublishingProvider } = await import('./youtube-provider');
    return new YouTubePublishingProvider();
  }
  throw new Error(`Unsupported publishing provider: ${name}`);
}
