import { describe, expect, it } from 'vitest';
import { MockPublishingProvider, MockVideoProvider } from './providers';

describe('mock providers', () => {
  it('simulates generation without making a paid call', async () => {
    const provider = new MockVideoProvider();
    const started = await provider.generateVideo({ jobId: 'job-1', prompt: 'original test prompt', durationSeconds: 35 });
    expect(started.status).toBe('GENERATING');
    expect(started.providerJobId).toBe('mock-video-job-1');

    const ready = await provider.getJobStatus(started.providerJobId);
    expect(ready.status).toBe('READY_FOR_REVIEW');
    expect(ready.thumbnailUrl).toContain('sample-thumb.svg');
    expect(ready.videoUrl).toBeUndefined();
  });

  it('simulates publishing without a YouTube call', async () => {
    const provider = new MockPublishingProvider();
    const result = await provider.uploadVideo({
      jobId: 'job-2',
      videoUrl: 'mock://video',
      title: 'Test',
      description: '',
      visibility: 'PRIVATE'
    });
    expect(result.status).toBe('PUBLISHED');
    expect(result.externalVideoId).toBe('mock-youtube-job-2');
  });
});
