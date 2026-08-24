import { ApiActionButton } from '@/app/components/ApiActionButton';
import { getAutopilotStatus } from '@/src/lib/autopilot';
import { getFactoryCounters, recentActivity } from '@/src/lib/control-plane';
import { prisma } from '@/src/lib/prisma';
import { getYouTubeConnectionStatus } from '@/src/lib/youtube-auth';
import { hasDurableOpenArtOAuthCredential } from '@/src/lib/openart-oauth';

export const dynamic = 'force-dynamic';

const empty = {
  prompts: 0, DRAFT: 0, QUEUED: 0, GENERATING: 0, READY_FOR_REVIEW: 0,
  APPROVED: 0, REJECTED: 0, SCHEDULED: 0, PUBLISHING: 0, PUBLISHED: 0, FAILED: 0, CANCELLED: 0
};

function formatInZone(date: Date, timeZone: string) {
  try {
    return new Intl.DateTimeFormat('en', { timeZone, weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
  } catch {
    return date.toISOString();
  }
}

export default async function DashboardPage() {
  let counters = empty;
  let activity: Array<{ id: string; action: string; actor: string; createdAt: Date }> = [];
  let databaseReady = true;
  let settings: { productionPaused: boolean; publishingPaused: boolean } = { productionPaused: false, publishingPaused: false };
  let channels: Array<{ id: string; name: string; type: 'GENERAL' | 'KIDS_CHANNEL_ONLY'; externalChannelId: string | null }> = [];
  let autopilot: Awaited<ReturnType<typeof getAutopilotStatus>> | null = null;
  let workerHeartbeat: Date | null = null;
  let openArtOAuth = false;
  let upcoming: Array<{
    id: string;
    publishAt: Date;
    timezone: string;
    visibility: 'PRIVATE' | 'UNLISTED' | 'PUBLIC';
    job: { prompt: { externalPromptId: string; concept: string }; channel: { name: string } };
  }> = [];

  try {
    const result = await Promise.all([
      getFactoryCounters(),
      recentActivity(6),
      prisma.appSettings.findUnique({ where: { id: 'singleton' }, select: { productionPaused: true, publishingPaused: true } }),
      prisma.channel.findMany({ where: { enabled: true }, select: { id: true, name: true, type: true, externalChannelId: true }, orderBy: { createdAt: 'asc' } }),
      getAutopilotStatus(),
      prisma.publishSchedule.findMany({
        where: { publishAt: { gte: new Date() }, status: 'PENDING' },
        select: {
          id: true,
          publishAt: true,
          timezone: true,
          visibility: true,
          job: { select: { prompt: { select: { externalPromptId: true, concept: true } }, channel: { select: { name: true } } } }
        },
        orderBy: { publishAt: 'asc' },
        take: 3
      }),
      prisma.activityLog.findFirst({ where: { action: 'WORKER_HEARTBEAT' }, select: { createdAt: true }, orderBy: { createdAt: 'desc' } }),
      hasDurableOpenArtOAuthCredential().catch(() => false)
    ]);
    counters = result[0];
    activity = result[1];
    if (result[2]) settings = result[2];
    channels = result[3];
    autopilot = result[4];
    upcoming = result[5];
    workerHeartbeat = result[6]?.createdAt ?? null;
    openArtOAuth = result[7];
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
  const zeroCost = process.env.ZERO_COST_MODE === 'true';
  const publishingMode = process.env.PUBLISHING_PROVIDER || 'mock';
  const workerHealthy = Boolean(workerHeartbeat && Date.now() - workerHeartbeat.getTime() < 90_000);

  const controlMap = [
    ['💡 Prompt Library', '/prompts', 'Choose or inspect ideas and send one into production.'],
    ['⚙️ Production Queue', '/queue', 'See every job and its exact state: queued, generating, failed, review-ready and more.'],
    ['👁 Review', '/review', 'Watch generated videos, approve, reject or regenerate.'],
    ['🗓 Schedule', '/schedule', 'Choose publish time and visibility after approval.'],
    ['📈 Analytics', '/analytics', 'Track YouTube performance and learning signals.'],
    ['🚀 Setup', '/setup', 'See every connection, safety lock and launch requirement.'],
    ['🔧 Settings', '/settings', 'Channels, Autopilot, limits, providers and factory controls.']
  ] as const;

  return (
    <div className="page">
      <section className="hero">
        <div className="eyebrow">CONTROL ROOM</div>
        <h1>Factory status</h1>
        <p>Generation, review, smart scheduling, YouTube publishing and analytics from one control room. No production screen is hidden: every factory surface is linked below and in the main navigation.</p>
        <div className="hero-actions">
          <a className="button" href="/prompts">💡 Prompt Library</a>
          <a className="button secondary" href="/queue">⚙️ Queue</a>
          <a className="button secondary" href="/review">👁 Review</a>
          <a className="button secondary" href="/schedule">🗓 Schedule</a>
          <a className="button secondary" href="/analytics">📈 Analytics</a>
          <a className="button secondary" href="/setup">🚀 Setup</a>
          <a className="button secondary" href="/settings">🔧 Settings</a>
        </div>
      </section>

      {zeroCost ? <section className="notice">
        <strong>ZERO-COST TEST MODE</strong><br />
        Creative provider: Ollama / deterministic fallback · Video provider: Local FFmpeg · Cost: $0 · OpenArt: disabled · YouTube: PRIVATE only
      </section> : null}

      {!databaseReady ? <div className="notice">Database is not configured yet. Add DATABASE_URL, run database setup, then refresh.</div> : null}
      {settings.productionPaused || settings.publishingPaused ? <div className="notice"><strong>Factory pause is active.</strong> Production: {settings.productionPaused ? 'PAUSED' : 'RUNNING'} · Publishing: {settings.publishingPaused ? 'PAUSED' : 'RUNNING'} · <a href="/settings">Open controls</a></div> : null}

      <section className="stats">
        {stats.map(([label, value]) => (
          <div className="card" key={label}><div className="metric">{value}</div><div className="label">{label}</div></div>
        ))}
      </section>

      <section className="card">
        <div className="section-title">🧭 Factory map</div>
        <p className="muted">Everything you can operate is visible here. Pick a stage and jump straight to it.</p>
        <div className="control-map">
          {controlMap.map(([label, href, description]) => (
            <a className="control-map-link" href={href} key={href}>
              <strong>{label}</strong>
              <small>{description}</small>
            </a>
          ))}
        </div>
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

      <section className="card">
        <div className="prompt-head"><div className="section-title">🗓 Next publishing</div><a className="button secondary" href="/schedule">Open schedule</a></div>
        {upcoming.length ? <div className="list">{upcoming.map((item) => (
          <div className="row" key={item.id}>
            <span><strong>{item.job.prompt.externalPromptId}</strong><small className="block muted">{item.job.channel.name} · {item.job.prompt.concept}</small></span>
            <span><span className="badge">{formatInZone(item.publishAt, item.timezone)}</span><small className="block muted">{item.timezone} · {item.visibility}</small></span>
          </div>
        ))}</div> : <p className="muted">Nothing scheduled yet. Approve a review with “Approve + smart schedule” to fill the next safe slot automatically.</p>}
      </section>

      <section className="grid two-col">
        <div className="card">
          <div className="section-title">Connections & interlocks</div>
          <div className="row"><span>Video provider</span><span className="badge">{generationMode.toUpperCase()}</span></div>
          <div className="row"><span>OpenArt</span><span className="badge">{zeroCost ? 'DISABLED BY ZERO-COST MODE' : generationMode === 'openart-mcp' && openArtOAuth ? 'DIRECT MCP READY' : generationMode === 'openart-mcp' ? 'OAUTH NEEDED' : 'NOT SELECTED'}</span></div>
          <div className="row"><span>Creative provider</span><span className="badge">{zeroCost ? 'OLLAMA / DETERMINISTIC' : (process.env.CREATIVE_DIRECTOR || 'mock').toUpperCase()}</span></div>
          <div className="row"><span>Cost</span><span className="badge">{zeroCost ? '$0' : 'PROVIDER RATE'}</span></div>
          <div className="row"><span>Worker</span><span className="badge">{workerHealthy ? 'HEALTHY' : 'STALE / OFFLINE'}</span></div>
          <div className="row"><span>Paid generation</span><span className="badge">{zeroCost ? 'HARD LOCKED' : process.env.ALLOW_PAID_GENERATION === 'true' ? 'UNLOCKED' : 'LOCKED'}</span></div>
          <div className="row"><span>YouTube channels</span><span className="badge">{connectedYouTube}/{channels.length} CONNECTED</span></div>
          <div className="row"><span>Publishing provider</span><span className="badge">{publishingMode.toUpperCase()}</span></div>
          <div className="row"><span>YouTube upload</span><span className="badge">{process.env.ALLOW_YOUTUBE_UPLOAD === 'true' ? 'UNLOCKED' : 'LOCKED'}</span></div>
          <div className="row"><span>Public publishing</span><span className="badge">{process.env.ALLOW_PUBLIC_PUBLISHING === 'true' ? 'UNLOCKED' : zeroCost ? 'LOCKED · PRIVATE ONLY' : 'LOCKED'}</span></div>
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
