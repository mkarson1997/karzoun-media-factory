import { prisma } from '@/src/lib/prisma';
import { SettingsForm } from '@/app/components/SettingsForm';
import { getYouTubeConnectionStatus } from '@/src/lib/youtube-auth';

export const dynamic = 'force-dynamic';

const defaults = {
  projectName: 'Karzoun Media Factory',
  timezone: 'Europe/Istanbul',
  defaultLanguage: 'en',
  dailyProductionLimit: 3,
  dailyPublishingLimit: 3
};

export default async function SettingsPage() {
  const settings = await prisma.appSettings.upsert({ where: { id: 'singleton' }, update: {}, create: { id: 'singleton' } }).catch(() => defaults);
  const channels = await prisma.channel.findMany({ orderBy: { createdAt: 'asc' } }).catch(() => []);
  const youtube = await getYouTubeConnectionStatus().catch(() => ({ configured: false, connected: false }));
  const openArtConfigured = Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_MODEL && process.env.OPENART_MCP_ACCESS_TOKEN);
  const paidUnlocked = process.env.ALLOW_PAID_GENERATION === 'true';
  const uploadUnlocked = process.env.ALLOW_YOUTUBE_UPLOAD === 'true';
  const publicUnlocked = process.env.ALLOW_PUBLIC_PUBLISHING === 'true';

  return (
    <div className="page">
      <section className="hero">
        <div className="eyebrow">CONFIGURATION</div>
        <h1>Settings</h1>
        <p>Operational settings live here. API secrets stay server-side and YouTube refresh tokens are stored encrypted when OAuth is connected.</p>
      </section>

      <div className="grid two-col">
        <SettingsForm settings={settings} />
        <div className="grid">
          <section className="card">
            <div className="section-title">Channels</div>
            {channels.length ? <div className="list">{channels.map((channel) => (
              <div className="row" key={channel.id}><span>{channel.name}<small className="block muted">{channel.type} · default {channel.defaultVisibility}</small></span><span className="badge">{channel.enabled ? 'ENABLED' : 'DISABLED'}</span></div>
            ))}</div> : <p className="muted">Run the seed command to create Karzoun Media Lab.</p>}
            <p className="muted">Kids content requires a separate KIDS_CHANNEL_ONLY channel and cannot auto-route into the general channel.</p>
          </section>

          <section className="card">
            <div className="section-title">Provider status</div>
            <div className="row"><span>Video generation</span><span className="badge">{(process.env.VIDEO_PROVIDER || 'mock').toUpperCase()}</span></div>
            <div className="row"><span>OpenArt MCP OAuth</span><span className="badge">{openArtConfigured ? 'CONFIGURED' : 'NOT CONNECTED'}</span></div>
            <div className="row"><span>Paid generation</span><span className="badge">{paidUnlocked ? 'UNLOCKED' : 'LOCKED'}</span></div>
            <div className="row"><span>Model preference</span><span className="badge">{process.env.VIDEO_MODEL_HINT || 'AUTO'}</span></div>
            <div className="row"><span>YouTube OAuth client</span><span className="badge">{youtube.configured ? 'CONFIGURED' : 'MISSING'}</span></div>
            <div className="row"><span>YouTube channel</span><span className="badge">{youtube.connected ? 'CONNECTED' : 'NOT CONNECTED'}</span></div>
            <div className="row"><span>YouTube upload</span><span className="badge">{uploadUnlocked ? 'UNLOCKED' : 'LOCKED'}</span></div>
            <div className="row"><span>Public publishing</span><span className="badge">{publicUnlocked ? 'UNLOCKED' : 'LOCKED'}</span></div>
            <div className="row"><span>Analytics refresh</span><span className="badge">{process.env.ANALYTICS_SYNC_MINUTES || '30'} MIN</span></div>
            <div className="row"><span>Telegram bot</span><span className="badge">{process.env.TELEGRAM_BOT_TOKEN ? 'CONFIGURED' : 'NOT CONNECTED'}</span></div>
            <div className="row"><span>Creative director</span><span className="badge">{process.env.CREATIVE_DIRECTOR === 'anthropic' ? 'CLAUDE' : 'MOCK'}</span></div>
          </section>

          <section className="card">
            <div className="section-title">Safety interlocks</div>
            <p className="muted">Provider credentials can be configured while real spending and publishing remain locked. Unlock paid generation, YouTube upload, and public publishing separately only when that exact action is intended.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
