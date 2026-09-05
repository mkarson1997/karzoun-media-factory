import { afterEach, describe, expect, it } from 'vitest';
import {
  isBlockedRemoteIp,
  isBlockedRemoteIpv4,
  isRemoteMediaHostAllowed,
  pinnedRemoteRequestOptions
} from './remote-media';

describe('remote media SSRF policy', () => {
  afterEach(() => {
    delete process.env.REMOTE_MEDIA_ALLOWED_HOSTS;
  });

  it('requires exact allowlist host matches instead of implicit subdomain wildcards', () => {
    process.env.REMOTE_MEDIA_ALLOWED_HOSTS = 'cdn.example.com,media.example.com';
    expect(isRemoteMediaHostAllowed('cdn.example.com')).toBe(true);
    expect(isRemoteMediaHostAllowed('media.example.com')).toBe(true);
    expect(isRemoteMediaHostAllowed('evil.cdn.example.com')).toBe(false);
    expect(isRemoteMediaHostAllowed('cdn.example.com.evil.test')).toBe(false);
  });

  it('blocks private, loopback, link-local and documentation IPv4 ranges', () => {
    for (const address of [
      '127.0.0.1',
      '10.0.0.1',
      '172.16.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '192.0.2.10',
      '198.51.100.10',
      '203.0.113.10'
    ]) {
      expect(isBlockedRemoteIpv4(address)).toBe(true);
    }
    expect(isBlockedRemoteIpv4('8.8.8.8')).toBe(false);
  });

  it('blocks unsafe IPv6 ranges', () => {
    for (const address of ['::1', '::', 'fe80::1', 'fc00::1', 'fd00::1', 'ff02::1', '2001:db8::1']) {
      expect(isBlockedRemoteIp(address)).toBe(true);
    }
    expect(isBlockedRemoteIp('2606:4700:4700::1111')).toBe(false);
  });

  it('pins the TCP destination to the vetted IP while preserving TLS SNI and Host', () => {
    const options = pinnedRemoteRequestOptions({
      url: new URL('https://cdn.example.com/video/file.mp4?download=1'),
      address: '93.184.216.34',
      family: 4
    });
    expect(options.hostname).toBe('93.184.216.34');
    expect(options.servername).toBe('cdn.example.com');
    expect(options.path).toBe('/video/file.mp4?download=1');
    expect(options.rejectUnauthorized).toBe(true);
    expect((options.headers as Record<string, string>).host).toBe('cdn.example.com');
  });
});
