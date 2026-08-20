import type { JobStatus } from './job-state-machine';

export interface VideoGenerationRequest {
  jobId: string;
  prompt: string;
  durationSeconds: number;
}

export interface VideoGenerationResult {
  providerJobId: string;
  status: JobStatus;
  videoUrl?: string;
  thumbnailUrl?: string;
}

export interface VideoGenerationProvider {
  generateVideo(input: VideoGenerationRequest): Promise<VideoGenerationResult>;
  getJobStatus(providerJobId: string): Promise<VideoGenerationResult>;
  cancelJob(providerJobId: string): Promise<void>;
}

export interface PublishingRequest {
  jobId: string;
  videoUrl: string;
  title: string;
  description: string;
  publishAt?: Date;
  visibility: 'PRIVATE' | 'UNLISTED' | 'PUBLIC';
}

export interface PublishingResult {
  externalVideoId?: string;
  status: JobStatus;
}

export interface PublishingProvider {
  uploadVideo(input: PublishingRequest): Promise<PublishingResult>;
  scheduleVideo(input: PublishingRequest): Promise<PublishingResult>;
  getVideoStatus(externalVideoId: string): Promise<PublishingResult>;
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
      videoUrl: '/demo/sample-short.mp4',
      thumbnailUrl: '/demo/sample-thumb.jpg'
    };
  }

  async cancelJob(): Promise<void> {}
}

export class MockPublishingProvider implements PublishingProvider {
  async uploadVideo(input: PublishingRequest): Promise<PublishingResult> {
    return { externalVideoId: `mock-youtube-${input.jobId}`, status: 'PUBLISHED' };
  }

  async scheduleVideo(input: PublishingRequest): Promise<PublishingResult> {
    return { externalVideoId: `mock-youtube-${input.jobId}`, status: 'SCHEDULED' };
  }

  async getVideoStatus(externalVideoId: string): Promise<PublishingResult> {
    return { externalVideoId, status: 'PUBLISHED' };
  }
}
