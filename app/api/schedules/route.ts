import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { scheduleApprovedJob } from '@/src/lib/control-plane';
import { assertSameOriginMutation, safeError } from '@/src/lib/http-security';

const schema = z.object({
  jobId: z.string().min(1),
  publishAt: z.string().datetime(),
  timezone: z.string().trim().min(1).max(80),
  visibility: z.enum(['PRIVATE', 'UNLISTED', 'PUBLIC']).default('PRIVATE'),
  title: z.string().trim().max(100).optional(),
  description: z.string().trim().max(5000).optional(),
  hashtags: z.array(z.string().trim().max(80)).max(15).optional()
});

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const input = schema.parse(await request.json());
    const job = await scheduleApprovedJob(input.jobId, {
      publishAt: new Date(input.publishAt),
      timezone: input.timezone,
      visibility: input.visibility,
      title: input.title,
      description: input.description,
      hashtags: input.hashtags
    });
    return NextResponse.json({ ok: true, job });
  } catch (error) {
    return NextResponse.json({ ok: false, error: safeError(error) }, { status: 400 });
  }
}
