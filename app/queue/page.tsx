import { listJobs } from '@/src/lib/control-plane';
import { ApiActionButton } from '@/app/components/ApiActionButton';

export const dynamic = 'force-dynamic';

export default async function QueuePage() {
  let jobs: Awaited<ReturnType<typeof listJobs>> = [];
  let databaseReady = true;
  try { jobs = await listJobs({ take: 100 }); } catch { databaseReady = false; }

  return (
    <div className="page">
      <section className="hero">
        <div className="eyebrow">PRODUCTION</div>
        <h1>Queue</h1>
        <p>Every job follows the validated state machine. Real paid generation remains off until the mock workflow passes.</p>
        <div className="hero-actions"><a className="button" href="/prompts">Queue another prompt</a></div>
      </section>

      {!databaseReady ? <div className="notice">Database is not configured.</div> : null}

      <section className="card">
        <div className="section-title">Latest jobs</div>
        {jobs.length ? <div className="list">{jobs.map((job) => (
          <article className="job-card" key={job.id}>
            <div className="prompt-head">
              <div><strong>{job.prompt.externalPromptId}</strong><small className="block muted">{job.prompt.category} · {job.requestedDuration}s · {job.channel.name}</small></div>
              <span className="badge">{job.status}</span>
            </div>
            <p>{job.prompt.concept}</p>
            <div className="actions">
              {job.status === 'QUEUED' ? <ApiActionButton endpoint={`/api/jobs/${job.id}/transition`} body={{ to: 'GENERATING' }} label="Start mock generation" /> : null}
              {job.status === 'GENERATING' ? <ApiActionButton endpoint={`/api/jobs/${job.id}/transition`} body={{ to: 'READY_FOR_REVIEW' }} label="Finish mock generation" /> : null}
              {job.status === 'FAILED' || job.status === 'REJECTED' ? <ApiActionButton endpoint={`/api/jobs/${job.id}/transition`} body={{ to: 'QUEUED' }} label="Retry" /> : null}
              {['DRAFT','QUEUED','GENERATING','REJECTED','SCHEDULED','FAILED'].includes(job.status) ? <ApiActionButton className="button danger" endpoint={`/api/jobs/${job.id}/transition`} body={{ to: 'CANCELLED' }} label="Cancel" confirmText="Cancel this job?" /> : null}
              {job.status === 'READY_FOR_REVIEW' ? <a className="button" href="/review">Review</a> : null}
              {job.status === 'APPROVED' ? <a className="button" href={`/schedule?job=${job.id}`}>Schedule</a> : null}
            </div>
          </article>
        ))}</div> : <p className="muted">Queue is empty.</p>}
      </section>
    </div>
  );
}
