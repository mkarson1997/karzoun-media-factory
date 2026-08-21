import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { importPromptCsv } from '@/src/lib/prompt-import';
import { assertSameOriginMutation } from '@/src/lib/http-security';

const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: 'Choose a CSV file' }, { status: 400 });
    if (!file.name.toLowerCase().endsWith('.csv')) return NextResponse.json({ ok: false, error: 'Only CSV files are accepted' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: 'CSV exceeds the 5 MB upload limit' }, { status: 413 });

    const text = await file.text();
    const summary = await importPromptCsv(prisma, text);
    await prisma.activityLog.create({
      data: {
        actor: 'dashboard',
        action: 'PROMPTS_IMPORTED',
        entityType: 'PromptLibrary',
        entityId: 'library',
        metadata: {
          imported: summary.imported,
          updated: summary.updated,
          rejected: summary.rejected,
          total: summary.total
        }
      }
    });
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1200) : 'Prompt import failed';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
