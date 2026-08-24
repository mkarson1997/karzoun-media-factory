import { afterEach, describe, expect, it } from 'vitest';
import { getVideoGenerationProvider, MockPublishingProvider, MockVideoProvider } from './providers';

describe('mock providers', () => {
  afterEach(() => { delete process.env.ZERO_COST_MODE; delete process.env.VIDEO_PROVIDER; });
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

  it('hard-overrides paid providers with local FFmpeg in zero-cost mode', async () => {
    process.env.ZERO_COST_MODE = 'true';
    process.env.VIDEO_PROVIDER = 'openart-mcp';
    const provider = await getVideoGenerationProvider();
    expect(provider.constructor.name).toBe('LocalDemoVideoProvider');
  });
});
