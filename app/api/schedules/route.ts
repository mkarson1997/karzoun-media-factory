import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { scheduleApprovedJob } from '@/src/lib/control-plane';
import { localDateTimeToUtc } from '@/src/lib/smart-scheduler';
import { assertSameOriginMutation, safeError } from '@/src/lib/http-security';

const schema = z.object({
  jobId: z.string().min(1),
  publishAt: z.string().datetime().optional(),
  publishLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).optional(),
  timezone: z.string().trim().min(1).max(80),
  visibility: z.enum(['PRIVATE', 'UNLISTED', 'PUBLIC']).default('PRIVATE'),
  title: z.string().trim().max(100).optional(),
  description: z.string().trim().max(5000).optional(),
  hashtags: z.array(z.string().trim().max(80)).max(15).optional()
}).refine((value) => Boolean(value.publishAt || value.publishLocal), {
  message: 'A publish date and time is required',
  path: ['publishLocal']
});

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const input = schema.parse(await request.json());
    const publishAt = input.publishLocal
      ? localDateTimeToUtc(input.publishLocal, input.timezone)
      : new Date(input.publishAt!);
    const job = await scheduleApprovedJob(input.jobId, {
      publishAt,
      timezone: input.timezone,
      visibility: input.visibility,
      title: input.title,
      description: input.description,
      hashtags: input.hashtags
    });
    return NextResponse.json({ ok: true, job, publishAt: publishAt.toISOString() });
  } catch (error) {
    return NextResponse.json({ ok: false, error: safeError(error) }, { status: 400 });
  }
}
