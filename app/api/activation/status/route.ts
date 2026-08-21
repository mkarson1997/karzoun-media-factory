import { NextResponse } from 'next/server';
import { getActivationReport } from '@/src/lib/activation-report';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const report = await getActivationReport();
    return NextResponse.json({ ok: true, report });
  } catch {
    return NextResponse.json({ ok: false, error: 'Activation report unavailable' }, { status: 503 });
  }
}
