import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';

const GCM_IV_LENGTH_BYTES = 12;
const GCM_AUTH_TAG_LENGTH_BYTES = 16;

function encryptionKey() {
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 16) throw new Error('APP_SECRET must be configured with at least 16 characters before storing integration credentials');
  return createHash('sha256').update(`karzoun-media-factory:credentials:v1:${secret}`).digest();
}

export async function storeIntegrationSecret(provider: string, secret: string, metadata?: Prisma.InputJsonValue) {
  if (!provider || !secret) throw new Error('Provider and secret are required');
  const iv = randomBytes(GCM_IV_LENGTH_BYTES);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv, { authTagLength: GCM_AUTH_TAG_LENGTH_BYTES });
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  if (tag.length !== GCM_AUTH_TAG_LENGTH_BYTES) throw new Error('AES-GCM produced an unexpected authentication tag length');

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

  const iv = Buffer.from(stored.iv, 'base64');
  const authTag = Buffer.from(stored.authTag, 'base64');
  if (iv.length !== GCM_IV_LENGTH_BYTES) throw new Error('Stored integration credential has an invalid AES-GCM IV');
  if (authTag.length !== GCM_AUTH_TAG_LENGTH_BYTES) throw new Error('Stored integration credential has an invalid AES-GCM authentication tag');

  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    iv,
    { authTagLength: GCM_AUTH_TAG_LENGTH_BYTES }
  );
  decipher.setAuthTag(authTag);
  const plain = Buffer.concat([
    decipher.update(Buffer.from(stored.encryptedSecret, 'base64')),
    decipher.final()
  ]);
  return { secret: plain.toString('utf8'), metadata: stored.metadata, updatedAt: stored.updatedAt };
}

export async function deleteIntegrationSecret(provider: string) {
  await prisma.integrationCredential.deleteMany({ where: { provider } });
}
