const stats = [
  ['Prompts', '0'],
  ['Queued', '0'],
  ['In review', '0'],
  ['Published', '0'],
  ['Generating', '0'],
  ['Approved', '0'],
  ['Scheduled', '0'],
  ['Failed', '0']
] as const;

export default function DashboardPage() {
  return (
    <div className="page">
      <section className="hero">
        <div className="eyebrow">CONTROL ROOM</div>
        <h1>Factory status</h1>
        <p>Mock mode is active. No paid generation or real YouTube publishing can run yet.</p>
      </section>

      <section className="stats">
        {stats.map(([label, value]) => (
          <div className="card" key={label}>
            <div className="metric">{value}</div>
            <div className="label">{label}</div>
          </div>
        ))}
      </section>

      <section className="grid">
        <div className="card">
          <div className="section-title">Connections</div>
          <div className="row"><span>Video provider</span><span className="badge">MOCK</span></div>
          <div className="row"><span>YouTube</span><span className="badge">NOT CONNECTED</span></div>
          <div className="row"><span>Telegram</span><span className="badge">AWAITING TOKEN</span></div>
        </div>

        <div className="card">
          <div className="section-title">Safe next actions</div>
          <div className="list muted">
            <span>1. Import the 1,000-prompt CSV.</span>
            <span>2. Queue one prompt in mock mode.</span>
            <span>3. Review from mobile or Telegram.</span>
            <span>4. Only then connect paid generation and YouTube.</span>
          </div>
        </div>
      </section>
    </div>
  );
}
