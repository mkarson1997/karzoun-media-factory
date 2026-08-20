import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';

function encryptionKey() {
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 16) throw new Error('APP_SECRET must be configured with at least 16 characters before storing integration credentials');
  return createHash('sha256').update(`karzoun-media-factory:credentials:v1:${secret}`).digest();
}

export async function storeIntegrationSecret(provider: string, secret: string, metadata?: Prisma.InputJsonValue) {
  if (!provider || !secret) throw new Error('Provider and secret are required');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return prisma.integrationCredential.upsert({
    where: { provider },
    create: {
      provider,
      encryptedSecret: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: tag.toString('base64'),
      metadata
    },
    update: {
      encryptedSecret: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: tag.toString('base64'),
      metadata
    }
  });
}

export async function readIntegrationSecret(provider: string) {
  const stored = await prisma.integrationCredential.findUnique({ where: { provider } });
  if (!stored) return null;

  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(stored.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(stored.authTag, 'base64'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(stored.encryptedSecret, 'base64')),
    decipher.final()
  ]);
  return { secret: plain.toString('utf8'), metadata: stored.metadata, updatedAt: stored.updatedAt };
}

export async function deleteIntegrationSecret(provider: string) {
  await prisma.integrationCredential.deleteMany({ where: { provider } });
}
