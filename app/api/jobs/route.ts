import { JobStatus } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { listJobs, queuePrompt } from '@/src/lib/control-plane';
import { assertSameOriginMutation, safeError } from '@/src/lib/http-security';

export const dynamic = 'force-dynamic';

const queueSchema = z.object({ promptId: z.string().min(1) });

export async function GET(request: NextRequest) {
  const statusRaw = request.nextUrl.searchParams.get('status');
  const status = statusRaw && Object.values(JobStatus).includes(statusRaw as JobStatus) ? statusRaw as JobStatus : undefined;
  const jobs = await listJobs({ status, take: 100 });
  return NextResponse.json({ ok: true, jobs });
}

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const { promptId } = queueSchema.parse(await request.json());
    const job = await queuePrompt(promptId);
    return NextResponse.json({ ok: true, job }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: safeError(error) }, { status: 400 });
  }
}
