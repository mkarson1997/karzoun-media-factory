import { prisma } from '@/src/lib/prisma';
import { SettingsForm } from '@/app/components/SettingsForm';

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
  const openArtConfigured = Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_MODEL && process.env.OPENART_MCP_ACCESS_TOKEN);
  const paidUnlocked = process.env.ALLOW_PAID_GENERATION === 'true';

  return (
    <div className="page">
      <section className="hero">
        <div className="eyebrow">CONFIGURATION</div>
        <h1>Settings</h1>
        <p>Safe operational settings live here. API secrets and OAuth tokens stay only in server environment variables.</p>
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
            <div className="row"><span>YouTube OAuth</span><span className="badge">{process.env.YOUTUBE_CLIENT_ID ? 'CONFIGURED' : 'NOT CONNECTED'}</span></div>
            <div className="row"><span>Telegram bot</span><span className="badge">{process.env.TELEGRAM_BOT_TOKEN ? 'CONFIGURED' : 'NOT CONNECTED'}</span></div>
            <div className="row"><span>Creative director</span><span className="badge">{process.env.CREATIVE_DIRECTOR === 'anthropic' ? 'CLAUDE' : 'MOCK'}</span></div>
          </section>

          <section className="card">
            <div className="section-title">Safety interlock</div>
            <p className="muted">OpenArt can be fully configured while paid generation remains locked. Credits are allowed to spend only when VIDEO_PROVIDER=openart-mcp and ALLOW_PAID_GENERATION=true are both set intentionally.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
