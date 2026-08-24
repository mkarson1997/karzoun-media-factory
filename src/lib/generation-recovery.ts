export type GenerationWorkDecision = 'SUBMIT' | 'POLL' | 'WAIT' | 'FAIL_UNCERTAIN' | 'NONE';

export function generationWorkDecision(job: { status: string; providerJobId?: string | null; creationId?: string | null; startedAt?: Date | null }, now = new Date()): GenerationWorkDecision {
  const providerId = job.creationId || job.providerJobId;
  if (job.status === 'GENERATING' && providerId) return 'POLL';
  if (job.status === 'GENERATING') {
    if (!job.startedAt || now.getTime() - job.startedAt.getTime() >= 2 * 60_000) return 'FAIL_UNCERTAIN';
    return 'WAIT';
  }
  if (job.status === 'QUEUED' && !providerId) return 'SUBMIT';
  return 'NONE';
}

export function notificationDedupeKey(kind: 'review' | 'failure', jobId: string, generationAttempt: number) {
  return `${kind}:${jobId}:${generationAttempt}`;
}

export function generationResetFields() {
  return {
    providerJobId: null,
    creationId: null,
    providerStatus: null,
    videoUrl: null,
    thumbnailUrl: null,
    actualDuration: null,
    failureReason: null,
    startedAt: null,
    lastPolledAt: null,
    nextPollAt: null,
    completedAt: null
  } as const;
}
