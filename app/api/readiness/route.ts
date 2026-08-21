import { NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { evaluateRuntimeSafety, readinessSummary } from '@/src/lib/runtime-readiness';

export const dynamic = 'force-dynamic';

export async function GET() {
  const config = readinessSummary(evaluateRuntimeSafety(process.env));
  let database = { ok: false, detail: 'unavailable' };

  try {
    await prisma.$queryRaw`SELECT 1`;
    database = { ok: true, detail: 'ready' };
  } catch {
    database = { ok: false, detail: 'unavailable' };
  }

  const ready = config.ready && database.ok;
  return NextResponse.json({
    ok: ready,
    service: 'karzoun-media-factory',
    database,
    config: {
      ready: config.ready,
      blocking: config.blocking.map((item) => ({ name: item.name, detail: item.detail })),
      warnings: config.warnings.map((item) => ({ name: item.name, detail: item.detail }))
    }
  }, { status: ready ? 200 : 503 });
}
