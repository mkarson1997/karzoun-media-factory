import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { assertSameOriginMutation, safeError } from '@/src/lib/http-security';
import { generatePromptBank, promptBankStats, promptBankToCsv } from '@/src/lib/prompt-bank-generator';
import { importPromptCsv } from '@/src/lib/prompt-import';

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);

    const result = await prisma.$transaction(async (tx) => {
      await tx.appSettings.upsert({
        where: { id: 'singleton' },
        update: {},
        create: {
          id: 'singleton',
          projectName: 'Karzoun Media Factory',
          timezone: 'Europe/Istanbul',
          defaultLanguage: 'en',
          dailyProductionLimit: 3,
          dailyPublishingLimit: 3
        }
      });

      const existing = await tx.channel.findFirst({ where: { type: 'GENERAL' }, orderBy: { createdAt: 'asc' } });
      const channel = existing ?? await tx.channel.create({
        data: { name: 'Karzoun Media Lab', type: 'GENERAL', enabled: true, defaultVisibility: 'PRIVATE' }
      });
      if (!channel.enabled) await tx.channel.update({ where: { id: channel.id }, data: { enabled: true } });

      return { channelId: channel.id, channelName: channel.name, createdChannel: !existing };
    });

    const rows = generatePromptBank();
    const summary = await importPromptCsv(prisma, promptBankToCsv(rows));
    const stats = promptBankStats(rows);

    await prisma.activityLog.create({
      data: {
        actor: 'setup-wizard',
        action: 'SAFE_FACTORY_BOOTSTRAPPED',
        entityType: 'Factory',
        entityId: 'singleton',
        metadata: {
          ...result,
          prompts: rows.length,
          general: stats.byChannel.GENERAL ?? 0,
          kids: stats.byChannel.KIDS_CHANNEL_ONLY ?? 0,
          imported: summary.imported,
          updated: summary.updated,
          rejected: summary.rejected
        }
      }
    });

    return NextResponse.json({
      ok: true,
      channel: result,
      prompts: { total: rows.length, general: stats.byChannel.GENERAL ?? 0, kids: stats.byChannel.KIDS_CHANNEL_ONLY ?? 0 },
      summary
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: safeError(error) }, { status: 400 });
  }
}
