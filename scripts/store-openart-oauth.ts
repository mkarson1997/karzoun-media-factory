import { z } from 'zod';
import { prisma } from '../src/lib/prisma';
import { storeOpenArtOAuthCredential } from '../src/lib/openart-oauth';

const schema = z.object({
  accessToken: z.string().min(1).optional(),
  refreshToken: z.string().min(1).optional(),
  clientId: z.string().min(1).optional(),
  clientSecret: z.string().min(1).optional(),
  tokenEndpoint: z.string().url().optional(),
  scope: z.string().min(1).optional(),
  tokenEndpointAuthMethod: z.string().min(1).optional()
}).refine((value) => Boolean(value.accessToken || value.refreshToken), {
  message: 'Expected an access token or refresh token'
});

async function readStdin() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8').trim();
}

async function main() {
  const raw = await readStdin();
  if (!raw) throw new Error('No OAuth credential JSON received on stdin');
  const credential = schema.parse(JSON.parse(raw));
  await storeOpenArtOAuthCredential(credential);
  console.log(`OpenArt OAuth stored securely. Refresh token: ${credential.refreshToken ? 'YES' : 'NO'}.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
