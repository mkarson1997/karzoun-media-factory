import { listJobs } from '@/src/lib/control-plane';
import { ApiActionButton } from '@/app/components/ApiActionButton';
import { AutoRefresh } from '@/app/components/AutoRefresh';
import { VideoPreview } from '@/app/components/VideoPreview';

export const dynamic = 'force-dynamic';

export default async function ReviewPage() {
  let jobs: Awaited<ReturnType<typeof listJobs>> = [];
  let databaseReady = true;
  try {
    const groups = await Promise.all([
      listJobs({ status: 'READY_FOR_REVIEW', take: 50 }),
      listJobs({ status: 'FAILED', take: 20 }),
      listJobs({ status: 'GENERATING', take: 20 })
    ]);
    jobs = groups.flat().sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, 50);
  } catch { databaseReady = false; }

  return (
    <div className="page">
      <section className="hero">
        <div className="prompt-head">
          <div>
            <div className="eyebrow">QUALITY GATE</div>
            <h1>Review</h1>
          </div>
          <AutoRefresh seconds={5} />
        </div>
        <p>Inspect the generated result, then approve and smart-schedule it in one tap, approve without scheduling, regenerate, or reject it. This page refreshes automatically while the renderer finishes.</p>
        <div className="hero-actions"><a className="button secondary" href="/queue">Production queue</a><a className="button secondary" href="/prompts">Prompt Library</a></div>
      </section>

      {!databaseReady ? <div className="notice">Database is not configured.</div> : null}

      <section className="review-grid">
        {jobs.length ? jobs.map((job) => (
          <article className="card review-card" key={job.id}>
            <div className="video-frame">
              {job.videoUrl ? <VideoPreview src={job.videoUrl} poster={job.thumbnailUrl ?? undefined} providerStatus={job.providerStatus} creationId={job.creationId || job.providerJobId} /> : <div className="video-placeholder" style={job.thumbnailUrl ? { backgroundImage: `linear-gradient(rgba(7,11,22,.25),rgba(7,11,22,.65)),url(${job.thumbnailUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>NO PROVIDER MEDIA<br/><small>{job.providerStatus || job.status}</small></div>}
            </div>
            <div className="prompt-head">
              <div><strong>{job.prompt.externalPromptId}</strong><small className="block muted">{job.prompt.category} · {job.requestedDuration}s · {job.provider}</small></div>
              <span className="actions"><span className="badge">{job.origin === 'AUTOPILOT' ? '🤖 AUTO' : 'MANUAL'}</span><span className="badge">{job.prompt.channelType === 'KIDS_CHANNEL_ONLY' ? 'KIDS ONLY' : 'GENERAL'}</span></span>
            </div>
            <p>{job.prompt.concept}</p>
            <div className="row"><span>Creative director</span><span className="badge">{job.creativeModel ?? 'NOT PREPARED'}</span></div>
            <div className="row"><span>Provider status</span><span className="badge">{job.providerStatus || job.status}</span></div>
            <div className="row"><span>Creation ID</span><span className="muted">{job.creationId || job.providerJobId || 'Not captured'}</span></div>
            <div className="row"><span>Media URL</span><span className="muted">{job.videoUrl ? 'Captured and provider-validated' : 'Missing'}</span></div>
            {job.failureReason ? <div className="notice"><strong>Failure:</strong> {job.failureReason}</div> : null}
            {job.creativeBrief ? <details><summary className="button secondary">Creative plan</summary><pre className="prompt-text">{JSON.stringify(job.creativeBrief, null, 2)}</pre></details> : null}
            <div className="actions">
              {job.status === 'READY_FOR_REVIEW' && job.videoUrl ? <ApiActionButton endpoint={`/api/jobs/${job.id}/approve-smart`} body={{}} label="✓ Approve + smart schedule" /> : null}
              {job.status === 'READY_FOR_REVIEW' && job.videoUrl ? <ApiActionButton endpoint={`/api/jobs/${job.id}/transition`} body={{ to: 'APPROVED' }} label="Approve only" className="button secondary" /> : null}
              {job.status === 'READY_FOR_REVIEW' || job.status === 'FAILED' ? <ApiActionButton endpoint={`/api/jobs/${job.id}/regenerate`} body={{}} label={job.status === 'FAILED' ? 'Retry generation' : '↻ Regenerate'} className="button secondary" /> : null}
              {job.status === 'READY_FOR_REVIEW' ? <ApiActionButton className="button danger" endpoint={`/api/jobs/${job.id}/transition`} body={{ to: 'REJECTED' }} label="Reject" /> : null}
            </div>
          </article>
        )) : <div className="card"><p className="muted">Nothing is waiting for review yet. If a live render is running, keep this page open and it will appear automatically.</p><a className="button" href="/queue">Open queue</a></div>}
      </section>
    </div>
  );
}
