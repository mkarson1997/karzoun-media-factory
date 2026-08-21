import { NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, service: 'karzoun-media-factory' }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return NextResponse.json({ ok: false, service: 'karzoun-media-factory' }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}
