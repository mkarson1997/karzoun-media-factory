import { prisma } from '@/src/lib/prisma';
import { SettingsForm } from '@/app/components/SettingsForm';
import { ChannelForm } from '@/app/components/ChannelForm';
import { ApiActionButton } from '@/app/components/ApiActionButton';
import { LogoutForm } from '@/app/components/LogoutForm';
import { getYouTubeConnectionStatus } from '@/src/lib/youtube-auth';
import { getAutopilotStatus } from '@/src/lib/autopilot';

export const dynamic = 'force-dynamic';

const defaults = {
  projectName: 'Karzoun Media Factory',
  timezone: 'Europe/Istanbul',
  defaultLanguage: 'en',
  dailyProductionLimit: 3,
  dailyPublishingLimit: 3,
  productionPaused: false,
  publishingPaused: false,
  autopilotEnabled: false,
  autopilotGeneralDailyTarget: 2,
  autopilotKidsEnabled: false,
  autopilotKidsDailyTarget: 0
};

export default async function SettingsPage() {
  const settings = await prisma.appSettings.upsert({ where: { id: 'singleton' }, update: {}, create: { id: 'singleton' } }).catch(() => defaults);
  const channels = await prisma.channel.findMany({ orderBy: { createdAt: 'asc' } }).catch(() => []);
  const autopilot = await getAutopilotStatus().catch(() => null);
  const channelConnections = new Map<string, { configured: boolean; connected: boolean }>();
  await Promise.all(channels.map(async (channel) => {
    const status = await getYouTubeConnectionStatus(channel.id).catch(() => ({ configured: false, connected: false }));
    channelConnections.set(channel.id, status);
  }));
  const youtubeClientConfigured = Boolean(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET && process.env.APP_BASE_URL);
  const openArtConfigured = Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_MODEL && process.env.OPENART_MCP_ACCESS_TOKEN);
  const paidUnlocked = process.env.ALLOW_PAID_GENERATION === 'true';
  const autopilotPaidUnlocked = process.env.ALLOW_AUTOPILOT_PAID_GENERATION === 'true';
  const uploadUnlocked = process.env.ALLOW_YOUTUBE_UPLOAD === 'true';
  const publicUnlocked = process.env.ALLOW_PUBLIC_PUBLISHING === 'true';

  return (
    <div className="page">
      <section className="hero">
        <div className="eyebrow">CONFIGURATION</div>
        <h1>Settings</h1>
        <p>Operational settings live here. Each factory channel can have its own encrypted YouTube OAuth connection.</p>
        <div className="hero-actions"><a className="button secondary" href="/setup">🚀 Launch wizard</a><LogoutForm /></div>
      </section>

      <section className="card">
        <div className="section-title">Factory control</div>
        <div className="row"><span>Production</span><span className="badge">{settings.productionPaused ? 'PAUSED' : 'RUNNING'}</span></div>
        <div className="row"><span>Publishing</span><span className="badge">{settings.publishingPaused ? 'PAUSED' : 'RUNNING'}</span></div>
        <div className="row"><span>Autopilot</span><span className="badge">{settings.autopilotEnabled ? 'ARMED' : 'OFF'}</span></div>
        {autopilot ? <div className="row"><span>Autopilot rolling 24h<small className="block muted">Unused bank: {autopilot.unused.general} general · {autopilot.unused.kids} kids</small></span><span className="badge">{autopilot.rolling24h.generalQueued}/{autopilot.rolling24h.generalTarget} GENERAL</span></div> : null}
        {autopilot?.safetyBlock ? <div className="notice">{autopilot.safetyBlock}</div> : null}
        <div className="actions">
          <ApiActionButton endpoint="/api/controls/pause" body={{ productionPaused: true, publishingPaused: true }} label="⏸ Pause everything" confirmText="Pause production and publishing? Existing generated files and analytics are kept." />
          <ApiActionButton endpoint="/api/controls/pause" body={{ productionPaused: false, publishingPaused: true }} label="Pause publishing only" />
          <ApiActionButton endpoint="/api/controls/pause" body={{ productionPaused: false, publishingPaused: false }} label="▶ Resume factory" />
        </div>
      </section>

      <div className="grid two-col">
        <SettingsForm settings={settings} />
        <div className="grid">
          <section className="card">
            <div className="section-title">Channels</div>
            {channels.length ? <div className="list">{channels.map((channel) => {
              const connection = channelConnections.get(channel.id) ?? { configured: false, connected: false };
              return (
                <div className="row" key={channel.id}>
                  <span>
                    <strong>{channel.name}</strong>
                    <small className="block muted">{channel.type} · default {channel.defaultVisibility}</small>
                    <small className="block muted">YouTube: {channel.externalChannelId ?? 'not bound'}</small>
                  </span>
                  <span className="actions">
                    <span className="badge">{connection.connected ? 'YOUTUBE CONNECTED' : channel.enabled ? 'ENABLED' : 'DISABLED'}</span>
                    {channel.enabled && youtubeClientConfigured ? <a className="button secondary" href={`/api/youtube/connect?channelId=${encodeURIComponent(channel.id)}`}>{connection.connected ? 'Reconnect' : 'Connect YouTube'}</a> : null}
                  </span>
                </div>
              );
            })}</div> : <p className="muted">Run the seed command to create Karzoun Media Lab.</p>}
            <p className="muted">GENERAL and KIDS_CHANNEL_ONLY use separate channel records and separate OAuth credentials. A kids job cannot publish through the general channel binding.</p>
          </section>

          <section className="card">
            <div className="section-title">Add channel</div>
            <ChannelForm />
          </section>

          <section className="card">
            <div className="section-title">Provider status</div>
            <div className="row"><span>Video generation</span><span className="badge">{(process.env.VIDEO_PROVIDER || 'mock').toUpperCase()}</span></div>
            <div className="row"><span>OpenArt MCP OAuth</span><span className="badge">{openArtConfigured ? 'CONFIGURED' : 'NOT CONNECTED'}</span></div>
            <div className="row"><span>Paid generation</span><span className="badge">{paidUnlocked ? 'UNLOCKED' : 'LOCKED'}</span></div>
            <div className="row"><span>Autopilot paid generation</span><span className="badge">{autopilotPaidUnlocked ? 'UNLOCKED' : 'LOCKED'}</span></div>
            <div className="row"><span>Model preference</span><span className="badge">{process.env.VIDEO_MODEL_HINT || 'AUTO'}</span></div>
            <div className="row"><span>YouTube OAuth client</span><span className="badge">{youtubeClientConfigured ? 'CONFIGURED' : 'MISSING'}</span></div>
            <div className="row"><span>YouTube upload</span><span className="badge">{uploadUnlocked ? 'UNLOCKED' : 'LOCKED'}</span></div>
            <div className="row"><span>Public publishing</span><span className="badge">{publicUnlocked ? 'UNLOCKED' : 'LOCKED'}</span></div>
            <div className="row"><span>Analytics refresh</span><span className="badge">{process.env.ANALYTICS_SYNC_MINUTES || '30'} MIN</span></div>
            <div className="row"><span>Telegram bot</span><span className="badge">{process.env.TELEGRAM_BOT_TOKEN ? 'CONFIGURED' : 'NOT CONNECTED'}</span></div>
            <div className="row"><span>Creative director</span><span className="badge">{process.env.CREATIVE_DIRECTOR === 'anthropic' ? 'CLAUDE' : 'MOCK'}</span></div>
          </section>

          <section className="card">
            <div className="section-title">Safety interlocks</div>
            <p className="muted">Autopilot can choose and queue ideas, but it cannot auto-approve review, bypass the separate automatic-spending lock, or bypass YouTube publishing locks.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
