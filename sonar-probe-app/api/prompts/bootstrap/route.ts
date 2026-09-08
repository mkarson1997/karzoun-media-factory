import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { assertSameOriginMutation, safeError } from '@/src/lib/http-security';
import { generatePromptBank, promptBankToCsv, promptBankStats } from '@/src/lib/prompt-bank-generator';
import { importPromptCsv } from '@/src/lib/prompt-import';

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const rows = generatePromptBank();
    const summary = await importPromptCsv(prisma, promptBankToCsv(rows));
    const stats = promptBankStats(rows);

    await prisma.activityLog.create({
      data: {
        actor: 'dashboard',
        action: 'BUILTIN_PROMPT_BANK_INSTALLED',
        entityType: 'PromptBank',
        entityId: 'builtin-1000-v1',
        metadata: {
          ...summary,
          general: stats.byChannel.GENERAL ?? 0,
          kids: stats.byChannel.KIDS_CHANNEL_ONLY ?? 0,
          categories: Object.keys(stats.byCategory).length
        }
      }
    });

    return NextResponse.json({ ok: true, summary, stats });
  } catch (error) {
    return NextResponse.json({ ok: false, error: safeError(error) }, { status: 400 });
  }
}
