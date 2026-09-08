import { prisma } from '@/src/lib/prisma';
import { ScheduleForm } from '@/app/components/ScheduleForm';
import { getSmartPublishSuggestion } from '@/src/lib/smart-scheduler';

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
  const suggestion = selected ? await getSmartPublishSuggestion(selected.id).catch(() => null) : null;

  return (
    <div className="page">
      <section className="hero">
        <div className="eyebrow">PUBLISHING</div>
        <h1>Schedule</h1>
        <p>The factory suggests a collision-free publish slot using its own historical performance when enough data exists. Until then it uses a clearly marked starter rotation. Publishing locks still decide what can actually reach YouTube.</p>
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
          {selected ? <ScheduleForm
            jobId={selected.id}
            defaultTitle={selected.title ?? selected.prompt.concept.slice(0, 55)}
            defaultDescription={selected.description ?? ''}
            defaultTimezone={suggestion?.timezone ?? 'Europe/Istanbul'}
            defaultPublishLocal={suggestion?.localInput ?? ''}
            suggestionReason={suggestion ? `${suggestion.localLabel} · ${suggestion.reason}` : undefined}
          /> : null}
        </section>
      </div> : <div className="card"><p className="muted">No approved jobs are ready to schedule.</p><a className="button" href="/review">Open review</a></div>}
    </div>
  );
}
