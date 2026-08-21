import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { setAutopilotEnabled } from '@/src/lib/autopilot';
import { assertSameOriginMutation, safeError } from '@/src/lib/http-security';

const bodySchema = z.object({ enabled: z.boolean() });

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const { enabled } = bodySchema.parse(await request.json());
    const settings = await setAutopilotEnabled(enabled, 'dashboard');
    return NextResponse.json({ ok: true, enabled: settings.autopilotEnabled });
  } catch (error) {
    return NextResponse.json({ ok: false, error: safeError(error) }, { status: 400 });
  }
}
