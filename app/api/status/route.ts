import { NextResponse } from 'next/server';
import { getFactoryCounters, recentActivity } from '@/src/lib/control-plane';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [counters, activity] = await Promise.all([getFactoryCounters(), recentActivity(8)]);
    return NextResponse.json({ ok: true, counters, activity, mode: process.env.VIDEO_PROVIDER || 'mock' });
  } catch {
    return NextResponse.json({ ok: false, counters: null, activity: [], mode: process.env.VIDEO_PROVIDER || 'mock' }, { status: 503 });
  }
}
