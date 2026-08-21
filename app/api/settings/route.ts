import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/lib/prisma';
import { assertSameOriginMutation, safeError } from '@/src/lib/http-security';

export const dynamic = 'force-dynamic';

function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

const settingsSchema = z.object({
  projectName: z.string().trim().min(1).max(80),
  timezone: z.string().trim().min(1).max(80),
  defaultLanguage: z.string().trim().min(2).max(12),
  dailyProductionLimit: z.number().int().min(1).max(50),
  dailyPublishingLimit: z.number().int().min(1).max(20),
  autopilotEnabled: z.boolean(),
  autopilotGeneralDailyTarget: z.number().int().min(0).max(20),
  autopilotKidsEnabled: z.boolean(),
  autopilotKidsDailyTarget: z.number().int().min(0).max(20)
}).superRefine((value, ctx) => {
  if (!validTimezone(value.timezone)) {
    ctx.addIssue({ code: 'custom', path: ['timezone'], message: 'Timezone must be a valid IANA timezone such as Europe/Istanbul' });
  }

  const autopilotTarget = value.autopilotGeneralDailyTarget + (value.autopilotKidsEnabled ? value.autopilotKidsDailyTarget : 0);
  if (value.autopilotEnabled && autopilotTarget > value.dailyProductionLimit) {
    ctx.addIssue({
      code: 'custom',
      path: ['dailyProductionLimit'],
      message: 'Autopilot daily targets cannot exceed the global production limit'
    });
  }
});

export async function GET() {
  const settings = await prisma.appSettings.upsert({ where: { id: 'singleton' }, update: {}, create: { id: 'singleton' } });
  const channels = await prisma.channel.findMany({ orderBy: { createdAt: 'asc' } });
  return NextResponse.json({ ok: true, settings, channels });
}

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const input = settingsSchema.parse(await request.json());
    const settings = await prisma.appSettings.upsert({ where: { id: 'singleton' }, update: input, create: { id: 'singleton', ...input } });
    await prisma.activityLog.create({
      data: {
        actor: 'dashboard',
        action: 'SETTINGS_UPDATED',
        entityType: 'AppSettings',
        entityId: settings.id,
        metadata: {
          autopilotEnabled: settings.autopilotEnabled,
          autopilotGeneralDailyTarget: settings.autopilotGeneralDailyTarget,
          autopilotKidsEnabled: settings.autopilotKidsEnabled,
          autopilotKidsDailyTarget: settings.autopilotKidsDailyTarget
        }
      }
    });
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message ?? 'Invalid settings' : safeError(error);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
