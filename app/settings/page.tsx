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

  return (
    <div className="page">
      <section className="hero">
        <div className="eyebrow">CONFIGURATION</div>
        <h1>Settings</h1>
        <p>Safe operational settings live here. API secrets stay only in server environment variables.</p>
      </section>

      <div className="grid two-col">
        <SettingsForm settings={settings} />
        <div className="grid">
          <section className="card">
            <div className="section-title">Channels</div>
            {channels.length ? <div className="list">{channels.map((channel) => (
              <div className="row" key={channel.id}><span>{channel.name}<small className="block muted">{channel.type} · default {channel.defaultVisibility}</small></span><span className="badge">{channel.enabled ? 'ENABLED' : 'DISABLED'}</span></div>
            ))}</div> : <p className="muted">Run the seed command to create Karzoun Media Lab.</p>}
            <p className="muted">Kids content will use a separate KIDS_CHANNEL_ONLY channel. It will never be auto-routed into the general channel.</p>
          </section>

          <section className="card">
            <div className="section-title">Provider status</div>
            <div className="row"><span>Video generation</span><span className="badge">{(process.env.VIDEO_PROVIDER || 'mock').toUpperCase()}</span></div>
            <div className="row"><span>YouTube OAuth</span><span className="badge">{process.env.YOUTUBE_CLIENT_ID ? 'CONFIGURED' : 'NOT CONNECTED'}</span></div>
            <div className="row"><span>Telegram bot</span><span className="badge">{process.env.TELEGRAM_BOT_TOKEN ? 'CONFIGURED' : 'NOT CONNECTED'}</span></div>
            <div className="row"><span>Creative director</span><span className="badge">{process.env.ANTHROPIC_API_KEY ? 'KEY PRESENT' : 'NOT CONNECTED'}</span></div>
          </section>
        </div>
      </div>
    </div>
  );
}
