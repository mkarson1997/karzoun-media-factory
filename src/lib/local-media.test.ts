import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { localMediaFilename, localMediaUrl, resolveLocalMediaPath } from './local-media';

describe('local media safety', () => {
  const env = { MEDIA_STORAGE_PATH: path.resolve('test-media') } as unknown as NodeJS.ProcessEnv;

  it('resolves only flat MP4 names under the configured storage root', () => {
    expect(resolveLocalMediaPath('kmf-job-1.mp4', env)).toBe(path.join(env.MEDIA_STORAGE_PATH!, 'kmf-job-1.mp4'));
    expect(localMediaUrl('kmf-job-1.mp4')).toBe('/api/media/kmf-job-1.mp4');
  });

  it('blocks traversal and non-video files', () => {
    expect(() => resolveLocalMediaPath('../secret.mp4', env)).toThrow(/invalid/i);
    expect(() => resolveLocalMediaPath('notes.txt', env)).toThrow(/invalid/i);
    expect(() => localMediaFilename('/api/media/%2e%2e%2fsecret.mp4')).toThrow(/invalid/i);
  });

  it('round-trips provider IDs and application URLs', () => {
    expect(localMediaFilename('local-demo:kmf-safe.mp4')).toBe('kmf-safe.mp4');
    expect(localMediaFilename('/api/media/kmf-safe.mp4')).toBe('kmf-safe.mp4');
  });
});
