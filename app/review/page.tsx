import { listJobs } from '@/src/lib/control-plane';
import { ApiActionButton } from '@/app/components/ApiActionButton';

export const dynamic = 'force-dynamic';

export default async function ReviewPage() {
  let jobs: Awaited<ReturnType<typeof listJobs>> = [];
  let databaseReady = true;
  try { jobs = await listJobs({ status: 'READY_FOR_REVIEW', take: 50 }); } catch { databaseReady = false; }

  return (
    <div className="page">
      <section className="hero">
        <div className="eyebrow">QUALITY GATE</div>
        <h1>Review</h1>
        <p>Nothing publishes automatically here. Inspect the creative plan and generated result, then approve, regenerate, or reject it.</p>
      </section>

      {!databaseReady ? <div className="notice">Database is not configured.</div> : null}

      <section className="review-grid">
        {jobs.length ? jobs.map((job) => (
          <article className="card review-card" key={job.id}>
            <div className="video-frame">
              {job.videoUrl ? <video controls playsInline preload="metadata" poster={job.thumbnailUrl ?? undefined} src={job.videoUrl} /> : <div className="video-placeholder" style={job.thumbnailUrl ? { backgroundImage: `linear-gradient(rgba(7,11,22,.25),rgba(7,11,22,.65)),url(${job.thumbnailUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>VIDEO PREVIEW<br/><small>{job.provider.startsWith('mock') ? 'Mock mode · no paid render' : 'Render pending'}</small></div>}
            </div>
            <div className="prompt-head">
              <div><strong>{job.prompt.externalPromptId}</strong><small className="block muted">{job.prompt.category} · {job.requestedDuration}s · {job.provider}</small></div>
              <span className="actions"><span className="badge">{job.origin === 'AUTOPILOT' ? '🤖 AUTO' : 'MANUAL'}</span><span className="badge">{job.prompt.channelType === 'KIDS_CHANNEL_ONLY' ? 'KIDS ONLY' : 'GENERAL'}</span></span>
            </div>
            <p>{job.prompt.concept}</p>
            <div className="row"><span>Creative director</span><span className="badge">{job.creativeModel ?? 'NOT PREPARED'}</span></div>
            {job.creativeBrief ? <details><summary className="button secondary">Creative plan</summary><pre className="prompt-text">{JSON.stringify(job.creativeBrief, null, 2)}</pre></details> : null}
            <div className="actions">
              <ApiActionButton endpoint={`/api/jobs/${job.id}/transition`} body={{ to: 'APPROVED' }} label="✓ Approve" />
              <ApiActionButton endpoint={`/api/jobs/${job.id}/regenerate`} body={{}} label="↻ Regenerate" className="button secondary" />
              <ApiActionButton className="button danger" endpoint={`/api/jobs/${job.id}/transition`} body={{ to: 'REJECTED' }} label="Reject" />
            </div>
          </article>
        )) : <div className="card"><p className="muted">Nothing is waiting for review.</p><a className="button" href="/queue">Open queue</a></div>}
      </section>
    </div>
  );
}
