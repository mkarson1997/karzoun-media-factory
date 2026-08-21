import { ApiActionButton } from '@/app/components/ApiActionButton';
import { getAutopilotStatus } from '@/src/lib/autopilot';
import { getFactoryCounters, recentActivity } from '@/src/lib/control-plane';
import { prisma } from '@/src/lib/prisma';
import { getYouTubeConnectionStatus } from '@/src/lib/youtube-auth';

export const dynamic = 'force-dynamic';

const empty = {
  prompts: 0, DRAFT: 0, QUEUED: 0, GENERATING: 0, READY_FOR_REVIEW: 0,
  APPROVED: 0, REJECTED: 0, SCHEDULED: 0, PUBLISHING: 0, PUBLISHED: 0, FAILED: 0, CANCELLED: 0
};

export default async function DashboardPage() {
  let counters = empty;
  let activity: Array<{ id: string; action: string; actor: string; createdAt: Date }> = [];
  let databaseReady = true;
  let settings: { productionPaused: boolean; publishingPaused: boolean } = { productionPaused: false, publishingPaused: false };
  let channels: Array<{ id: string; name: string; type: 'GENERAL' | 'KIDS_CHANNEL_ONLY'; externalChannelId: string | null }> = [];
  let autopilot: Awaited<ReturnType<typeof getAutopilotStatus>> | null = null;

  try {
    const result = await Promise.all([
      getFactoryCounters(),
      recentActivity(6),
      prisma.appSettings.findUnique({ where: { id: 'singleton' }, select: { productionPaused: true, publishingPaused: true } }),
      prisma.channel.findMany({ where: { enabled: true }, select: { id: true, name: true, type: true, externalChannelId: true }, orderBy: { createdAt: 'asc' } }),
      getAutopilotStatus()
    ]);
    counters = result[0];
    activity = result[1];
    if (result[2]) settings = result[2];
    channels = result[3];
    autopilot = result[4];
  } catch {
    databaseReady = false;
  }

  const channelConnections = new Map<string, boolean>();
  if (databaseReady) {
    await Promise.all(channels.map(async (channel) => {
      const state = await getYouTubeConnectionStatus(channel.id).catch(() => ({ configured: false, connected: false }));
      channelConnections.set(channel.id, state.connected && Boolean(channel.externalChannelId));
    }));
  }
  const connectedYouTube = [...channelConnections.values()].filter(Boolean).length;

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

  const generationMode = process.env.VIDEO_PROVIDER || 'mock';
  const publishingMode = process.env.PUBLISHING_PROVIDER || 'mock';

  return (
    <div className="page">
      <section className="hero">
        <div className="eyebrow">CONTROL ROOM</div>
        <h1>Factory status</h1>
        <p>Generation, review, scheduling, YouTube publishing and analytics from one mobile control room.</p>
        <div className="hero-actions">
          <a className="button" href="/prompts">Open Prompt Library</a>
          <a className="button secondary" href="/review">Review queue</a>
          <a className="button secondary" href="/analytics">Analytics</a>
        </div>
      </section>

      {!databaseReady ? <div className="notice">Database is not configured yet. Add DATABASE_URL, run database setup, then refresh.</div> : null}
      {settings.productionPaused || settings.publishingPaused ? <div className="notice"><strong>Factory pause is active.</strong> Production: {settings.productionPaused ? 'PAUSED' : 'RUNNING'} · Publishing: {settings.publishingPaused ? 'PAUSED' : 'RUNNING'} · <a href="/settings">Open controls</a></div> : null}

      <section className="stats">
        {stats.map(([label, value]) => (
          <div className="card" key={label}><div className="metric">{value}</div><div className="label">{label}</div></div>
        ))}
      </section>

      {autopilot ? <section className="card">
        <div className="prompt-head">
          <div>
            <div className="section-title">🤖 Autopilot</div>
            <p className="muted">Selects unused prompts, learns from category performance, and stops every video at manual review.</p>
          </div>
          <span className="badge">{autopilot.enabled ? 'ARMED' : 'OFF'}</span>
        </div>
        <div className="row"><span>General target</span><span className="badge">{autopilot.rolling24h.generalQueued}/{autopilot.rolling24h.generalTarget}</span></div>
        <div className="row"><span>Kids target</span><span className="badge">{autopilot.kidsEnabled ? `${autopilot.rolling24h.kidsQueued}/${autopilot.rolling24h.kidsTarget}` : 'OFF'}</span></div>
        <div className="row"><span>Unused prompt bank</span><span className="muted">{autopilot.unused.general} general · {autopilot.unused.kids} kids</span></div>
        {autopilot.safetyBlock ? <div className="notice">{autopilot.safetyBlock}</div> : null}
        <div className="actions">
          {autopilot.enabled
            ? <ApiActionButton endpoint="/api/autopilot/toggle" body={{ enabled: false }} label="⏹ Disable autopilot" />
            : <ApiActionButton endpoint="/api/autopilot/toggle" body={{ enabled: true }} label="🤖 Enable autopilot" confirmText="Enable automatic GENERAL idea selection? Videos will still require manual review before publishing." />}
          {autopilot.enabled ? <ApiActionButton endpoint="/api/autopilot/tick" body={{}} label="⚡ Queue next safe idea" /> : null}
          <a className="button secondary" href="/settings">Targets & kids settings</a>
        </div>
      </section> : null}

      <section className="grid two-col">
        <div className="card">
          <div className="section-title">Connections & interlocks</div>
          <div className="row"><span>Video provider</span><span className="badge">{generationMode.toUpperCase()}</span></div>
          <div className="row"><span>Paid generation</span><span className="badge">{process.env.ALLOW_PAID_GENERATION === 'true' ? 'UNLOCKED' : 'LOCKED'}</span></div>
          <div className="row"><span>YouTube channels</span><span className="badge">{connectedYouTube}/{channels.length} CONNECTED</span></div>
          <div className="row"><span>Publishing provider</span><span className="badge">{publishingMode.toUpperCase()}</span></div>
          <div className="row"><span>YouTube upload</span><span className="badge">{process.env.ALLOW_YOUTUBE_UPLOAD === 'true' ? 'UNLOCKED' : 'LOCKED'}</span></div>
          <div className="row"><span>Public publishing</span><span className="badge">{process.env.ALLOW_PUBLIC_PUBLISHING === 'true' ? 'UNLOCKED' : 'LOCKED'}</span></div>
          <div className="row"><span>Telegram</span><span className="badge">{process.env.TELEGRAM_BOT_TOKEN ? 'CONFIGURED' : 'AWAITING TOKEN'}</span></div>
          <div className="row"><span>Database</span><span className="badge">{databaseReady ? 'READY' : 'NOT READY'}</span></div>
        </div>

        <div className="card">
          <div className="section-title">Active channels</div>
          {channels.length ? <div className="list">{channels.map((channel) => (
            <div className="row" key={channel.id}>
              <span>{channel.name}<small className="block muted">{channel.type}</small></span>
              <span className="badge">{channelConnections.get(channel.id) ? 'YOUTUBE READY' : 'NOT CONNECTED'}</span>
            </div>
          ))}</div> : <p className="muted">No active channels configured.</p>}
        </div>

        <div className="card">
          <div className="section-title">Recent activity</div>
          {activity.length ? <div className="list">{activity.map((item) => (
            <div className="row" key={item.id}><span>{item.action}<small className="block muted">{item.actor}</small></span><span className="muted">{item.createdAt.toLocaleString()}</span></div>
          ))}</div> : <p className="muted">No activity yet. Install prompts and run a mock job to begin.</p>}
        </div>
      </section>
    </div>
  );
}
