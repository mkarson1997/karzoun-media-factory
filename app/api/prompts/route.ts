import { ChannelType } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { listPrompts } from '@/src/lib/control-plane';
import { assertSameOriginMutation, safeError } from '@/src/lib/http-security';
import { prisma } from '@/src/lib/prisma';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  externalPromptId: z.string().trim().min(1).max(80),
  category: z.string().trim().min(1).max(80),
  concept: z.string().trim().min(1).max(500),
  fullPrompt: z.string().trim().min(20),
  targetDurationSeconds: z.number().int().min(30).max(59),
  channelType: z.enum(['GENERAL', 'KIDS_CHANNEL_ONLY'])
});

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get('search') ?? undefined;
  const channel = request.nextUrl.searchParams.get('channel');
  const channelType = channel === 'GENERAL' || channel === 'KIDS_CHANNEL_ONLY' ? channel : undefined;
  const prompts = await listPrompts({ search, channelType, take: 100 });
  return NextResponse.json({ ok: true, prompts });
}

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const input = createSchema.parse(await request.json());
    const prompt = await prisma.prompt.create({
      data: {
        ...input,
        channelType: ChannelType[input.channelType],
        active: true
      }
    });
    await prisma.activityLog.create({
      data: { actor: 'dashboard', action: 'PROMPT_CREATED', entityType: 'Prompt', entityId: prompt.id, metadata: { externalPromptId: input.externalPromptId } }
    });
    return NextResponse.json({ ok: true, prompt }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: safeError(error) }, { status: 400 });
  }
}
