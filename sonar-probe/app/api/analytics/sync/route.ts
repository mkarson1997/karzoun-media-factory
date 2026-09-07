import { NextRequest, NextResponse } from 'next/server';
import { assertSameOriginMutation, safeError } from '@/src/lib/http-security';
import { syncPublishedAnalytics } from '@/src/lib/youtube-analytics';

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const body = await request.json().catch(() => ({}));
    const force = body?.force === true;
    const summary = await syncPublishedAnalytics({ limit: 50, force });
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    return NextResponse.json({ ok: false, error: safeError(error) }, { status: 400 });
  }
}
