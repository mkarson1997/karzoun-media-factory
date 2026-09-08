export const JOB_STATUSES = [
  'DRAFT','QUEUED','GENERATING','READY_FOR_REVIEW','APPROVED','REJECTED',
  'SCHEDULED','PUBLISHING','PUBLISHED','FAILED','CANCELLED'
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

const allowed: Record<JobStatus, readonly JobStatus[]> = {
  DRAFT: ['QUEUED', 'CANCELLED'],
  QUEUED: ['GENERATING', 'CANCELLED'],
  GENERATING: ['READY_FOR_REVIEW', 'FAILED', 'CANCELLED'],
  READY_FOR_REVIEW: ['APPROVED', 'REJECTED'],
  APPROVED: ['SCHEDULED', 'READY_FOR_REVIEW'],
  REJECTED: ['QUEUED', 'CANCELLED'],
  SCHEDULED: ['PUBLISHING', 'CANCELLED'],
  PUBLISHING: ['PUBLISHED', 'FAILED'],
  PUBLISHED: [],
  FAILED: ['QUEUED', 'CANCELLED'],
  CANCELLED: []
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return allowed[from].includes(to);
}

export function assertTransition(from: JobStatus, to: JobStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid production job transition: ${from} -> ${to}`);
  }
}

export function nextStatuses(from: JobStatus): readonly JobStatus[] {
  return allowed[from];
}
