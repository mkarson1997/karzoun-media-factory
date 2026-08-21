import { NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { evaluateRuntimeSafety, readinessSummary } from '@/src/lib/runtime-readiness';

export const dynamic = 'force-dynamic';

export async function GET() {
  const config = readinessSummary(evaluateRuntimeSafety(process.env));
  let databaseReady = false;

  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseReady = true;
  } catch {
    databaseReady = false;
  }

  const ready = config.ready && databaseReady;
  const status = ready ? 200 : 503;

  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ ok: ready, service: 'karzoun-media-factory' }, { status });
  }

  return NextResponse.json({
    ok: ready,
    service: 'karzoun-media-factory',
    database: { ok: databaseReady },
    config: {
      ready: config.ready,
      blocking: config.blocking.map((item) => ({ name: item.name, detail: item.detail })),
      warnings: config.warnings.map((item) => ({ name: item.name, detail: item.detail }))
    }
  }, { status });
}
