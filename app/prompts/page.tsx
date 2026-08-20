import { listPrompts } from '@/src/lib/control-plane';
import { ApiActionButton } from '@/app/components/ApiActionButton';

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
        <p>Search the idea bank and send one concept into production. Kids-only prompts stay isolated from the general channel.</p>
      </section>

      <form className="card filter-bar" method="get">
        <input className="input" name="q" defaultValue={params.q} placeholder="Search ID, category or concept" />
        <select className="input" name="channel" defaultValue={channelType ?? ''}>
          <option value="">All channel types</option>
          <option value="GENERAL">General</option>
          <option value="KIDS_CHANNEL_ONLY">Kids only</option>
        </select>
        <button className="button" type="submit">Filter</button>
      </form>

      {!databaseReady ? <div className="notice">Database is not ready. Configure it before importing the 1,000-prompt CSV.</div> : null}

      <section className="card">
        <div className="section-title">{prompts.length} prompt{prompts.length === 1 ? '' : 's'} shown</div>
        {prompts.length ? <div className="list">{prompts.map((prompt) => (
          <article className="prompt-card" key={prompt.id}>
            <div className="prompt-head">
              <div><strong>{prompt.externalPromptId}</strong><small className="block muted">{prompt.category} · {prompt.targetDurationSeconds}s</small></div>
              <span className="badge">{prompt.channelType === 'KIDS_CHANNEL_ONLY' ? 'KIDS ONLY' : 'GENERAL'}</span>
            </div>
            <p>{prompt.concept}</p>
            <div className="actions">
              <ApiActionButton endpoint="/api/jobs" body={{ promptId: prompt.id }} label="Queue for production" />
              <details><summary className="button secondary">View prompt</summary><pre className="prompt-text">{prompt.fullPrompt}</pre></details>
            </div>
          </article>
        ))}</div> : <p className="muted">No prompts yet. Run the CSV importer to load the library.</p>}
      </section>
    </div>
  );
}
