import { NextRequest, NextResponse } from 'next/server';
import { notifyOperator } from '@/src/lib/telegram';
import { assertSameOriginMutation, safeError } from '@/src/lib/http-security';

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const sent = await notifyOperator('✅ Karzoun Media Factory test notification. Telegram control is connected.');
    if (!sent) return NextResponse.json({ ok: false, error: 'Telegram is not configured' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: safeError(error) }, { status: 400 });
  }
}
