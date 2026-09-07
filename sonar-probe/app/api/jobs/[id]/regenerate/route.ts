import { NextRequest, NextResponse } from 'next/server';
import { requestRegeneration } from '@/src/lib/control-plane';
import { assertSameOriginMutation, safeError } from '@/src/lib/http-security';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOriginMutation(request);
    const { id } = await context.params;
    const body = await request.json().catch(() => ({})) as { reuseCreativePlan?: boolean };
    const job = await requestRegeneration(id, { actor: 'dashboard', source: 'DASHBOARD', reuseCreativePlan: body.reuseCreativePlan });
    return NextResponse.json({ ok: true, job });
  } catch (error) {
    return NextResponse.json({ ok: false, error: safeError(error) }, { status: 400 });
  }
}
