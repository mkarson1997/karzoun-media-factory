import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  integrationCredential: {
    upsert: vi.fn(),
    findUnique: vi.fn(),
    deleteMany: vi.fn()
  }
}));

vi.mock('./prisma', () => ({ prisma: prismaMock }));

import { readIntegrationSecret, storeIntegrationSecret } from './secret-store';

const ORIGINAL_APP_SECRET = process.env.APP_SECRET;

describe('integration secret AES-GCM storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APP_SECRET = 'a'.repeat(32);
  });

  afterEach(() => {
    if (ORIGINAL_APP_SECRET === undefined) delete process.env.APP_SECRET;
    else process.env.APP_SECRET = ORIGINAL_APP_SECRET;
  });

  it('stores a full 128-bit GCM authentication tag', async () => {
    prismaMock.integrationCredential.upsert.mockResolvedValue({});

    await storeIntegrationSecret('test-provider', 'top-secret');

    const input = prismaMock.integrationCredential.upsert.mock.calls[0][0];
    expect(Buffer.from(input.create.iv, 'base64')).toHaveLength(12);
    expect(Buffer.from(input.create.authTag, 'base64')).toHaveLength(16);
  });

  it('rejects persisted credentials with a truncated authentication tag', async () => {
    prismaMock.integrationCredential.findUnique.mockResolvedValue({
      encryptedSecret: '',
      iv: Buffer.alloc(12).toString('base64'),
      authTag: Buffer.alloc(8).toString('base64'),
      metadata: null,
      updatedAt: new Date()
    });

    await expect(readIntegrationSecret('test-provider')).rejects.toThrow(/invalid AES-GCM authentication tag/i);
  });
});
