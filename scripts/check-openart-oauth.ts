import { prisma } from '../src/lib/prisma';
import { getOpenArtAccessToken, hasDurableOpenArtOAuthCredential } from '../src/lib/openart-oauth';

async function main() {
  const durable = await hasDurableOpenArtOAuthCredential();
  const token = await getOpenArtAccessToken();
  if (!token) throw new Error('No usable OpenArt OAuth token is available');
  console.log(`OpenArt OAuth check: OK. Durable refresh credential: ${durable ? 'YES' : 'NO'}.`);
  console.log('No OpenArt generation request was sent and no provider credits were spent.');
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
