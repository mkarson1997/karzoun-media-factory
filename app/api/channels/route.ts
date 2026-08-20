import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/lib/prisma';
import { assertSameOriginMutation } from '@/src/lib/http-security';

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  type: z.enum(['GENERAL', 'KIDS_CHANNEL_ONLY'])
});

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'Invalid channel name or type' }, { status: 400 });
    }

    const existing = await prisma.channel.findFirst({ where: { type: parsed.data.type, enabled: true } });
    if (existing) {
      return NextResponse.json({ ok: false, error: `An enabled ${parsed.data.type} channel already exists` }, { status: 409 });
    }

    const channel = await prisma.channel.create({
      data: {
        name: parsed.data.name,
        type: parsed.data.type,
        enabled: true,
        defaultVisibility: 'PRIVATE'
      }
    });
    await prisma.activityLog.create({
      data: {
        actor: 'dashboard',
        action: 'CHANNEL_CREATED',
        entityType: 'Channel',
        entityId: channel.id,
        metadata: { name: channel.name, type: channel.type }
      }
    });

    return NextResponse.json({ ok: true, channel: { id: channel.id, name: channel.name, type: channel.type } });
  } catch {
    return NextResponse.json({ ok: false, error: 'Could not create channel' }, { status: 500 });
  }
}
