import { prisma } from '@/src/lib/prisma';
import { ScheduleForm } from '@/app/components/ScheduleForm';

export const dynamic = 'force-dynamic';

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ job?: string }> }) {
  const { job: jobId } = await searchParams;
  const jobs = await prisma.productionJob.findMany({
    where: { status: 'APPROVED' },
    include: { prompt: true, channel: true },
    orderBy: { updatedAt: 'desc' },
    take: 25
  }).catch(() => []);
  const selected = jobId ? jobs.find((job) => job.id === jobId) : jobs[0];

  return (
    <div className="page">
      <section className="hero">
        <div className="eyebrow">PUBLISHING</div>
        <h1>Schedule</h1>
        <p>Scheduling is internal in Milestone 1. Every workflow defaults to PRIVATE until real YouTube integration is deliberately enabled.</p>
      </section>

      {jobs.length ? <div className="grid two-col">
        <section className="card">
          <div className="section-title">Approved videos</div>
          <div className="list">{jobs.map((job) => (
            <a className={`row ${selected?.id === job.id ? 'selected-row' : ''}`} href={`/schedule?job=${job.id}`} key={job.id}>
              <span>{job.prompt.concept}<small className="block muted">{job.prompt.externalPromptId} · {job.channel.name}</small></span><span className="badge">APPROVED</span>
            </a>
          ))}</div>
        </section>
        <section>
          {selected ? <ScheduleForm jobId={selected.id} defaultTitle={selected.title ?? selected.prompt.concept.slice(0, 55)} defaultDescription={selected.description ?? ''} /> : null}
        </section>
      </div> : <div className="card"><p className="muted">No approved jobs are ready to schedule.</p><a className="button" href="/review">Open review</a></div>}
    </div>
  );
}
