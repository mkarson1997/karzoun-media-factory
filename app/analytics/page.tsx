import { prisma } from '@/src/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const snapshots = await prisma.analyticsSnapshot.findMany({
    include: { job: { include: { prompt: true, channel: true } } },
    orderBy: { capturedAt: 'desc' },
    take: 25
  }).catch(() => []);

  return (
    <div className="page">
      <section className="hero">
        <div className="eyebrow">LEARNING LOOP</div>
        <h1>Analytics</h1>
        <p>YouTube metrics will feed this screen after publishing is connected. The factory never fabricates production analytics.</p>
      </section>

      <section className="stats">
        {['Views','Avg % viewed','Viewed vs swiped','Subscribers gained'].map((label) => <div className="card" key={label}><div className="metric">—</div><div className="label">{label}</div></div>)}
      </section>

      <section className="card">
        <div className="section-title">Performance snapshots</div>
        {snapshots.length ? <div className="list">{snapshots.map((item) => (
          <article className="row" key={item.id}>
            <span><strong>{item.job.prompt.externalPromptId}</strong><small className="block muted">{item.job.prompt.concept}</small></span>
            <span className="analytics-mini">{item.views} views · {item.performanceScore ?? '—'} score</span>
          </article>
        ))}</div> : <div className="empty-state"><strong>No real analytics yet</strong><p className="muted">This is intentional. Metrics appear only after YouTube is connected and a real published video has data.</p></div>}
      </section>
    </div>
  );
}
