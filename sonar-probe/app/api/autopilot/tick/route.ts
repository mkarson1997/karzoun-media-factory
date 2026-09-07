import { NextRequest, NextResponse } from 'next/server';
import { runAutopilotTick } from '@/src/lib/autopilot';
import { assertSameOriginMutation, safeError } from '@/src/lib/http-security';

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const result = await runAutopilotTick();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: safeError(error) }, { status: 400 });
  }
}
