import { getFactoryCounters, recentActivity } from '@/src/lib/control-plane';

export const dynamic = 'force-dynamic';

const empty = {
  prompts: 0, DRAFT: 0, QUEUED: 0, GENERATING: 0, READY_FOR_REVIEW: 0,
  APPROVED: 0, REJECTED: 0, SCHEDULED: 0, PUBLISHING: 0, PUBLISHED: 0, FAILED: 0, CANCELLED: 0
};

export default async function DashboardPage() {
  let counters = empty;
  let activity: Array<{ id: string; action: string; actor: string; createdAt: Date }> = [];
  let databaseReady = true;
  try {
    [counters, activity] = await Promise.all([getFactoryCounters(), recentActivity(6)]);
  } catch {
    databaseReady = false;
  }

  const stats = [
    ['Prompts', counters.prompts],
    ['Queued', counters.QUEUED],
    ['Generating', counters.GENERATING],
    ['In review', counters.READY_FOR_REVIEW],
    ['Approved', counters.APPROVED],
    ['Scheduled', counters.SCHEDULED],
    ['Published', counters.PUBLISHED],
    ['Failed', counters.FAILED]
  ] as const;

  return (
    <div className="page">
      <section className="hero">
        <div className="eyebrow">CONTROL ROOM</div>
        <h1>Factory status</h1>
        <p>One screen for generation, review, scheduling and publishing. Paid generation and real YouTube publishing remain disabled in Milestone 1.</p>
        <div className="hero-actions">
          <a className="button" href="/prompts">Open Prompt Library</a>
          <a className="button secondary" href="/review">Review queue</a>
        </div>
      </section>

      {!databaseReady ? <div className="notice">Database is not configured yet. Add DATABASE_URL, run database setup, then refresh.</div> : null}

      <section className="stats">
        {stats.map(([label, value]) => (
          <div className="card" key={label}><div className="metric">{value}</div><div className="label">{label}</div></div>
        ))}
      </section>

      <section className="grid two-col">
        <div className="card">
          <div className="section-title">Connections</div>
          <div className="row"><span>Video provider</span><span className="badge">{(process.env.VIDEO_PROVIDER || 'mock').toUpperCase()}</span></div>
          <div className="row"><span>YouTube</span><span className="badge">NOT CONNECTED</span></div>
          <div className="row"><span>Telegram</span><span className="badge">{process.env.TELEGRAM_BOT_TOKEN ? 'CONFIGURED' : 'AWAITING TOKEN'}</span></div>
          <div className="row"><span>Database</span><span className="badge">{databaseReady ? 'READY' : 'NOT READY'}</span></div>
        </div>

        <div className="card">
          <div className="section-title">Recent activity</div>
          {activity.length ? <div className="list">{activity.map((item) => (
            <div className="row" key={item.id}><span>{item.action}<small className="block muted">{item.actor}</small></span><span className="muted">{item.createdAt.toLocaleString()}</span></div>
          ))}</div> : <p className="muted">No real activity yet. Seed demo data or import prompts to begin.</p>}
        </div>
      </section>
    </div>
  );
}
