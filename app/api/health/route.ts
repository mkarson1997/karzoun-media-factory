import { NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, service: 'karzoun-media-factory', database: 'ready', mode: process.env.VIDEO_PROVIDER || 'mock' });
  } catch {
    return NextResponse.json({ ok: false, service: 'karzoun-media-factory', database: 'unavailable' }, { status: 503 });
  }
}
