import { listJobs } from '@/src/lib/control-plane';
import { ApiActionButton } from '@/app/components/ApiActionButton';
import { AutoRefresh } from '@/app/components/AutoRefresh';

export const dynamic = 'force-dynamic';

export default async function QueuePage() {
  let jobs: Awaited<ReturnType<typeof listJobs>> = [];
  let databaseReady = true;
  try { jobs = await listJobs({ take: 100 }); } catch { databaseReady = false; }

  return (
    <div className="page">
      <section className="hero">
        <div className="prompt-head">
          <div>
            <div className="eyebrow">PRODUCTION</div>
            <h1>Queue</h1>
          </div>
          <AutoRefresh seconds={5} />
        </div>
        <p>Manual and autopilot jobs share the same validated state machine, review gate, limits and provider safety locks. This screen refreshes automatically while live jobs move through the factory.</p>
        <div className="hero-actions"><a className="button" href="/prompts">Queue another prompt</a><a className="button secondary" href="/review">Open review</a><a className="button secondary" href="/dashboard">Control room</a></div>
      </section>

      {!databaseReady ? <div className="notice">Database is not configured.</div> : null}

      <section className="card">
        <div className="section-title">Latest jobs</div>
        {jobs.length ? <div className="list">{jobs.map((job) => {
          const mockJob = job.provider === 'mock' || job.provider === 'mock-demo';
          const queuedForMs = Date.now() - job.createdAt.getTime();
          const looksStalled = !mockJob && job.status === 'QUEUED' && queuedForMs > 20_000;
          return (
          <article className="job-card" key={job.id}>
            <div className="prompt-head">
              <div><strong>{job.prompt.externalPromptId}</strong><small className="block muted">{job.prompt.category} · {job.requestedDuration}s · {job.channel.name}</small></div>
              <span className="actions"><span className="badge">{job.origin === 'AUTOPILOT' ? '🤖 AUTO' : 'MANUAL'}</span><span className="badge">{job.status}</span></span>
            </div>
            <p>{job.prompt.concept}</p>
            <div className="row"><span>Provider</span><span className="badge">{job.provider.toUpperCase()}</span></div>
            {!mockJob && (job.status === 'QUEUED' || job.status === 'GENERATING') ? <p className="muted">Live-provider state is worker-owned. The dashboard cannot fake completion or skip the renderer.</p> : null}
            {looksStalled ? <div className="notice"><strong>Worker attention needed.</strong> This live job has stayed QUEUED for more than 20 seconds. Production may be marked RUNNING in settings while the worker container itself is restarting or blocked by startup configuration. Run <code>docker compose ps</code> and <code>docker compose logs --tail=120 worker</code> to see the exact cause.</div> : null}
            {job.schedule ? <div className="row"><span>Publish slot<small className="block muted">{job.schedule.timezone} · {job.schedule.visibility}</small></span><span className="badge">{job.schedule.publishAt.toLocaleString()}</span></div> : null}
            {job.failureReason ? <div className="notice"><strong>Failure:</strong> {job.failureReason}</div> : null}
            <div className="actions">
              {mockJob && job.status === 'QUEUED' ? <ApiActionButton endpoint={`/api/jobs/${job.id}/transition`} body={{ to: 'GENERATING' }} label="Start mock generation" /> : null}
              {mockJob && job.status === 'GENERATING' ? <ApiActionButton endpoint={`/api/jobs/${job.id}/transition`} body={{ to: 'READY_FOR_REVIEW' }} label="Finish mock generation" /> : null}
              {job.status === 'FAILED' || job.status === 'REJECTED' ? <ApiActionButton endpoint={`/api/jobs/${job.id}/transition`} body={{ to: 'QUEUED' }} label="Retry" /> : null}
              {['DRAFT','QUEUED','GENERATING','REJECTED','SCHEDULED','FAILED'].includes(job.status) ? <ApiActionButton className="button danger" endpoint={`/api/jobs/${job.id}/transition`} body={{ to: 'CANCELLED' }} label="Cancel" confirmText="Cancel this job?" /> : null}
              {job.status === 'READY_FOR_REVIEW' ? <a className="button" href="/review">Review</a> : null}
              {job.status === 'APPROVED' ? <ApiActionButton endpoint={`/api/jobs/${job.id}/approve-smart`} body={{}} label="Smart schedule" /> : null}
              {job.status === 'APPROVED' ? <a className="button secondary" href={`/schedule?job=${job.id}`}>Choose time</a> : null}
            </div>
          </article>
        );})}</div> : <p className="muted">Queue is empty. Pick an idea from Prompt Library.</p>}
      </section>
    </div>
  );
}
