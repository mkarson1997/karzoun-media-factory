import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/lib/prisma';
import { assertSameOriginMutation } from '@/src/lib/http-security';

const schema = z.object({
  productionPaused: z.boolean(),
  publishingPaused: z.boolean()
});

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ ok: false, error: 'Invalid pause state' }, { status: 400 });

    const settings = await prisma.appSettings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', ...parsed.data },
      update: parsed.data
    });
    await prisma.activityLog.create({
      data: {
        actor: 'dashboard',
        action: 'FACTORY_PAUSE_STATE_CHANGED',
        entityType: 'AppSettings',
        entityId: settings.id,
        metadata: parsed.data
      }
    });
    return NextResponse.json({ ok: true, state: parsed.data });
  } catch {
    return NextResponse.json({ ok: false, error: 'Could not change factory pause state' }, { status: 500 });
  }
}
