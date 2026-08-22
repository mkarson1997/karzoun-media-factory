import { listPrompts } from '@/src/lib/control-plane';
import { ApiActionButton } from '@/app/components/ApiActionButton';
import { PromptImportForm } from '@/app/components/PromptImportForm';

export const dynamic = 'force-dynamic';

export default async function PromptsPage({ searchParams }: { searchParams: Promise<{ q?: string; channel?: string }> }) {
  const params = await searchParams;
  const channelType = params.channel === 'GENERAL' || params.channel === 'KIDS_CHANNEL_ONLY' ? params.channel : undefined;
  let prompts: Awaited<ReturnType<typeof listPrompts>> = [];
  let databaseReady = true;
  try {
    prompts = await listPrompts({ search: params.q, channelType, take: 100 });
  } catch {
    databaseReady = false;
  }

  return (
    <div className="page">
      <section className="hero">
        <div className="eyebrow">LIBRARY</div>
        <h1>Prompt Library</h1>
        <p>Choose ideas, send one into production, and immediately see whether it is queued, generating, waiting for review, scheduled, published or failed. Kids-only prompts stay isolated from the general channel.</p>
        <div className="hero-actions">
          <a className="button secondary" href="/queue">Open production queue</a>
          <a className="button secondary" href="/review">Open review</a>
          <a className="button secondary" href="/dashboard">Back to control room</a>
        </div>
      </section>

      {databaseReady ? (
        <section className="card">
          <div className="section-title">Built-in 1,000-prompt bank</div>
          <p className="muted">650 general entertainment prompts + 350 kids-only prompts. Every brief targets 30–59 seconds, vertical 9:16, original imagery, continuity, captions/sound design and a loopable ending. Reinstalling is safe because IDs are upserted.</p>
          <div className="actions">
            <ApiActionButton
              endpoint="/api/prompts/bootstrap"
              body={{}}
              label="✨ Install 1,000 prompts"
              confirmText="Install or refresh the built-in 1,000-prompt bank? Existing matching prompt IDs will be updated, not duplicated."
              successText="Prompt bank refreshed successfully."
            />
          </div>
        </section>
      ) : <div className="notice">Database is not ready. Configure it before importing prompts.</div>}

      {databaseReady ? <PromptImportForm /> : null}

      <form className="card filter-bar" method="get">
        <input className="input" name="q" defaultValue={params.q} placeholder="Search ID, category or concept" />
        <select className="input" name="channel" defaultValue={channelType ?? ''}>
          <option value="">All channel types</option>
          <option value="GENERAL">General</option>
          <option value="KIDS_CHANNEL_ONLY">Kids only</option>
        </select>
        <button className="button" type="submit">Filter</button>
      </form>

      <section className="card">
        <div className="prompt-head">
          <div className="section-title">{prompts.length} prompt{prompts.length === 1 ? '' : 's'} shown</div>
          <a className="button secondary" href="/queue">View all jobs</a>
        </div>
        {prompts.length ? <div className="list">{prompts.map((prompt) => {
          const activeJob = prompt.jobs[0];
          return (
          <article className="prompt-card" key={prompt.id}>
            <div className="prompt-head">
              <div><strong>{prompt.externalPromptId}</strong><small className="block muted">{prompt.category} · {prompt.targetDurationSeconds}s</small></div>
              <span className="actions">
                <span className="badge">{prompt.channelType === 'KIDS_CHANNEL_ONLY' ? 'KIDS ONLY' : 'GENERAL'}</span>
                {activeJob ? <span className="badge">{activeJob.status}</span> : null}
              </span>
            </div>
            <p>{prompt.concept}</p>
            {activeJob ? (
              <div className="job-state-strip">
                <span><strong>Production already started</strong><small className="block muted">Provider: {activeJob.provider} · Current state: {activeJob.status}</small></span>
                <a className="button secondary" href="/queue">Open queue →</a>
              </div>
            ) : null}
            <div className="actions">
              {!activeJob ? (
                <ApiActionButton
                  endpoint="/api/jobs"
                  body={{ promptId: prompt.id }}
                  label="Queue for production"
                  successText="Queued successfully. Open the production queue →"
                  successHref="/queue"
                />
              ) : null}
              <details><summary className="button secondary">View prompt</summary><pre className="prompt-text">{prompt.fullPrompt}</pre></details>
            </div>
          </article>
        );})}</div> : <p className="muted">No prompts yet. Install the built-in bank above or upload a compatible CSV.</p>}
      </section>
    </div>
  );
}
