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
        <p>Nothing publishes automatically here. Watch the result, approve it, reject it, or send it back for regeneration.</p>
      </section>

      {!databaseReady ? <div className="notice">Database is not configured.</div> : null}

      <section className="review-grid">
        {jobs.length ? jobs.map((job) => (
          <article className="card review-card" key={job.id}>
            <div className="video-frame">
              {job.videoUrl ? <video controls playsInline preload="metadata" poster={job.thumbnailUrl ?? undefined} src={job.videoUrl} /> : <div className="video-placeholder">VIDEO PREVIEW<br/><small>Mock media will appear here</small></div>}
            </div>
            <div className="prompt-head">
              <div><strong>{job.prompt.externalPromptId}</strong><small className="block muted">{job.prompt.category} · {job.requestedDuration}s · {job.provider}</small></div>
              <span className="badge">{job.prompt.channelType === 'KIDS_CHANNEL_ONLY' ? 'KIDS ONLY' : 'GENERAL'}</span>
            </div>
            <p>{job.prompt.concept}</p>
            <div className="actions action-grid">
              <ApiActionButton endpoint={`/api/jobs/${job.id}/transition`} body={{ to: 'APPROVED' }} label="✓ Approve" />
              <ApiActionButton className="button danger" endpoint={`/api/jobs/${job.id}/transition`} body={{ to: 'REJECTED' }} label="Reject" />
            </div>
          </article>
        )) : <div className="card"><p className="muted">Nothing is waiting for review.</p><a className="button" href="/queue">Open queue</a></div>}
      </section>
    </div>
  );
}
