import { google } from 'googleapis';
import { prisma } from '@/src/lib/prisma';
import { getAuthorizedYouTubeClient } from '@/src/lib/youtube-auth';

export const dynamic = 'force-dynamic';

export default async function YouTubeSelectPage({ searchParams }: { searchParams: Promise<{ channelId?: string }> }) {
  const { channelId } = await searchParams;
  if (!channelId) {
    return <div className="page"><section className="card"><h1>Missing factory channel</h1><a className="button" href="/settings">Back to settings</a></section></div>;
  }

  const factoryChannel = await prisma.channel.findUnique({ where: { id: channelId } }).catch(() => null);
  if (!factoryChannel || !factoryChannel.enabled) {
    return <div className="page"><section className="card"><h1>Factory channel unavailable</h1><a className="button" href="/settings">Back to settings</a></section></div>;
  }

  let channels: Array<{ id: string; title: string; description: string | null; thumbnail: string | null }> = [];
  let error: string | null = null;
  try {
    const auth = await getAuthorizedYouTubeClient(factoryChannel.id);
    const youtube = google.youtube({ version: 'v3', auth });
    const response = await youtube.channels.list({ part: ['snippet'], mine: true, maxResults: 50 });
    channels = (response.data.items ?? []).flatMap((item) => item.id ? [{
      id: item.id,
      title: item.snippet?.title ?? item.id,
      description: item.snippet?.description ?? null,
      thumbnail: item.snippet?.thumbnails?.default?.url ?? null
    }] : []);
  } catch {
    error = 'Could not load the YouTube channels available to this Google authorization. Reconnect from Settings.';
  }

  return (
    <div className="page">
      <section className="hero">
        <div className="eyebrow">YOUTUBE BINDING</div>
        <h1>Choose the exact channel</h1>
        <p>Bind <strong>{factoryChannel.name}</strong> to the intended YouTube channel. This prevents the general and kids factories from accidentally publishing to the same destination.</p>
      </section>

      {error ? <div className="notice">{error}</div> : null}

      <section className="card">
        <div className="section-title">Available YouTube channels</div>
        {channels.length ? <div className="list">{channels.map((channel) => (
          <form className="row" method="post" action="/api/youtube/bind" key={channel.id}>
            <input type="hidden" name="factoryChannelId" value={factoryChannel.id} />
            <input type="hidden" name="youtubeChannelId" value={channel.id} />
            <span>
              <strong>{channel.title}</strong>
              <small className="block muted">{channel.id}</small>
              {channel.description ? <small className="block muted">{channel.description.slice(0, 140)}</small> : null}
            </span>
            <button className="button" type="submit">Bind this channel</button>
          </form>
        ))}</div> : !error ? <p className="muted">No owned YouTube channel was returned for this authorization.</p> : null}
      </section>

      <a className="button secondary" href="/settings">Cancel</a>
    </div>
  );
}
