import { NextRequest, NextResponse } from 'next/server';
import { approveAndSmartSchedule } from '@/src/lib/smart-scheduler';
import { assertSameOriginMutation, safeError } from '@/src/lib/http-security';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOriginMutation(request);
    const { id } = await context.params;
    const suggestion = await approveAndSmartSchedule(id, { actor: 'dashboard', source: 'DASHBOARD' });
    return NextResponse.json({ ok: true, suggestion });
  } catch (error) {
    return NextResponse.json({ ok: false, error: safeError(error) }, { status: 400 });
  }
}
