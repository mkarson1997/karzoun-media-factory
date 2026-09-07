import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { JOB_STATUSES, type JobStatus } from '@/src/lib/job-state-machine';
import { transitionJob } from '@/src/lib/control-plane';
import { assertSameOriginMutation, safeError } from '@/src/lib/http-security';
import { prisma } from '@/src/lib/prisma';

const bodySchema = z.object({
  to: z.enum(JOB_STATUSES),
  notes: z.string().trim().max(500).optional()
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOriginMutation(request);
    const { id } = await context.params;
    const input = bodySchema.parse(await request.json());

    const current = await prisma.productionJob.findUnique({ where: { id }, select: { provider: true } });
    if (!current) throw new Error('Production job not found');

    if (input.to === 'PUBLISHING' || input.to === 'PUBLISHED') {
      throw new Error('Worker-owned production state cannot be set from the dashboard');
    }

    if (input.to === 'GENERATING' || input.to === 'READY_FOR_REVIEW') {
      const mock = current.provider === 'mock' || current.provider === 'mock-demo';
      if (!mock) throw new Error('Live provider state is worker-owned and cannot be simulated from the dashboard');
    }

    const job = await transitionJob(id, input.to as JobStatus, { actor: 'dashboard', source: 'DASHBOARD', notes: input.notes });
    return NextResponse.json({ ok: true, job });
  } catch (error) {
    return NextResponse.json({ ok: false, error: safeError(error) }, { status: 400 });
  }
}
