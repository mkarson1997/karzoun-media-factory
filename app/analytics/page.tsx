import { prisma } from '@/src/lib/prisma';
import { ApiActionButton } from '@/app/components/ApiActionButton';

export const dynamic = 'force-dynamic';

function pct(value: number | null | undefined) {
  return value == null ? '—' : `${(value * 100).toFixed(1)}%`;
}

function compact(value: number) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export default async function AnalyticsPage() {
  const snapshots = await prisma.analyticsSnapshot.findMany({
    include: { job: { include: { prompt: true, channel: true, publishRecord: true } } },
    orderBy: { capturedAt: 'desc' },
    take: 250
  }).catch(() => []);

  const latest = new Map<string, (typeof snapshots)[number]>();
  for (const snapshot of snapshots) {
    if (!latest.has(snapshot.jobId)) latest.set(snapshot.jobId, snapshot);
  }
  const videos = [...latest.values()];
  const totalViews = videos.reduce((sum, item) => sum + item.views, 0);
  const totalEngaged = videos.reduce((sum, item) => sum + item.engagedViews, 0);
  const totalSubscribers = videos.reduce((sum, item) => sum + item.subscribersGained, 0);
  const weightedAverageViewed = totalViews > 0
    ? videos.reduce((sum, item) => sum + (item.averagePercentageViewed ?? 0) * item.views, 0) / totalViews
    : null;
  const engagedRate = totalViews > 0 ? totalEngaged / totalViews : null;
  const sorted = [...videos].sort((a, b) => (b.performanceScore ?? 0) - (a.performanceScore ?? 0));

  const categoryStats = new Map<string, { videos: number; views: number; scoreSum: number; scoreCount: number }>();
  for (const item of videos) {
    const key = item.job.prompt.category;
    const current = categoryStats.get(key) ?? { videos: 0, views: 0, scoreSum: 0, scoreCount: 0 };
    current.videos++;
    current.views += item.views;
    if (item.performanceScore != null) {
      current.scoreSum += item.performanceScore;
      current.scoreCount++;
    }
    categoryStats.set(key, current);
  }
  const categories = [...categoryStats.entries()]
    .map(([category, value]) => ({ category, ...value, averageScore: value.scoreCount ? value.scoreSum / value.scoreCount : 0 }))
    .sort((a, b) => b.averageScore - a.averageScore)
    .slice(0, 6);

  return (
    <div className="page">
      <section className="hero">
        <div className="eyebrow">LEARNING LOOP</div>
        <h1>Analytics</h1>
        <p>Real YouTube data only. The factory uses retention, engaged views, interaction, and subscriber conversion to rank its own Shorts.</p>
        <div className="actions">
          <ApiActionButton endpoint="/api/analytics/sync" body={{ force: true }} label="Sync YouTube analytics" />
        </div>
      </section>

      <section className="stats">
        <div className="card"><div className="metric">{videos.length ? compact(totalViews) : '—'}</div><div className="label">Views</div></div>
        <div className="card"><div className="metric">{weightedAverageViewed == null ? '—' : `${weightedAverageViewed.toFixed(1)}%`}</div><div className="label">Avg % viewed</div></div>
        <div className="card"><div className="metric">{engagedRate == null ? '—' : `${(engagedRate * 100).toFixed(1)}%`}</div><div className="label">Engaged-view rate</div></div>
        <div className="card"><div className="metric">{videos.length ? compact(totalSubscribers) : '—'}</div><div className="label">Subscribers gained</div></div>
      </section>

      <div className="notice">
        YouTube's public targeted Analytics API exposes <strong>engagedViews</strong>, but it does not expose the Studio "viewed vs swiped away" card directly. The factory keeps that field empty instead of inventing it.
      </div>

      <section className="grid two-col">
        <div className="card">
          <div className="section-title">Top videos</div>
          {sorted.length ? <div className="list">{sorted.slice(0, 10).map((item) => (
            <article className="row" key={item.id}>
              <span>
                <strong>{item.job.prompt.externalPromptId}</strong>
                <small className="block muted">{item.job.prompt.category} · {item.views.toLocaleString()} views</small>
              </span>
              <span className="analytics-mini">
                <strong>{item.performanceScore?.toFixed(1) ?? '—'}</strong> score
                <small className="block muted">{pct(item.engagedViewRate)} engaged</small>
              </span>
            </article>
          ))}</div> : <div className="empty-state"><strong>No real analytics yet</strong><p className="muted">Connect YouTube, publish a private test, then use Sync analytics.</p></div>}
        </div>

        <div className="card">
          <div className="section-title">Winning categories</div>
          {categories.length ? <div className="list">{categories.map((item) => (
            <div className="row" key={item.category}>
              <span><strong>{item.category}</strong><small className="block muted">{item.videos} videos · {item.views.toLocaleString()} views</small></span>
              <span className="badge">{item.averageScore.toFixed(1)}</span>
            </div>
          ))}</div> : <p className="muted">Category winners appear after analytics snapshots exist.</p>}
        </div>
      </section>

      <section className="card">
        <div className="section-title">Latest snapshots</div>
        {snapshots.length ? <div className="list">{snapshots.slice(0, 25).map((item) => (
          <article className="row" key={item.id}>
            <span>
              <strong>{item.job.prompt.externalPromptId}</strong>
              <small className="block muted">{item.capturedAt.toLocaleString()} · {item.source}</small>
            </span>
            <span className="analytics-mini">{item.views.toLocaleString()} views · {item.performanceScore ?? '—'} score</span>
          </article>
        ))}</div> : <p className="muted">No snapshots captured yet.</p>}
      </section>
    </div>
  );
}
