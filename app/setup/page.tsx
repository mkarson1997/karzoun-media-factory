import { ApiActionButton } from '@/app/components/ApiActionButton';
import { getActivationReport, type ActivationCheck } from '@/src/lib/activation-report';

export const dynamic = 'force-dynamic';

function icon(state: ActivationCheck['state']) {
  if (state === 'PASS') return '✓';
  if (state === 'LOCKED') return '🔒';
  if (state === 'WARN') return '!';
  return '→';
}

function phase(ok: boolean, label: string, detail: string) {
  return (
    <div className={`activation-phase ${ok ? 'activation-pass' : 'activation-pending'}`}>
      <span className="activation-phase-icon">{ok ? '✓' : '○'}</span>
      <span><strong>{label}</strong><small className="block muted">{detail}</small></span>
    </div>
  );
}

export default async function SetupPage() {
  const zeroCost = process.env.ZERO_COST_MODE === 'true';
  const report = await getActivationReport();
  const telegramConfigured = report.checks.find((item) => item.id === 'telegram')?.state === 'PASS';
  const promptBankInstalled = report.counts.generalPrompts > 0;
  const generalChannelExists = report.channels.some((channel) => channel.enabled && channel.type === 'GENERAL');
  const coreInstalled = promptBankInstalled && generalChannelExists;
  const youtubeClientReady = report.checks.find((item) => item.id === 'youtube-client')?.state === 'PASS';

  return (
    <div className="page">
      <section className="hero">
        <div className="eyebrow">LAUNCH WIZARD</div>
        <h1>Activate the factory</h1>
        <p>One screen for the values and connections that still need attention. Secret values never appear here, only whether each requirement is configured.</p>
        <div className="hero-actions">
          <a className="button secondary" href="/dashboard">Back to dashboard</a>
          <a className="button secondary" href="/settings">Open settings</a>
        </div>
      </section>

      {zeroCost ? <section className="notice"><strong>ZERO-COST TEST MODE</strong><br />Creative: local Ollama or deterministic fallback · Renderer: Local FFmpeg · OpenArt disabled · Cost $0 · YouTube PRIVATE only.</section> : null}

      <section className="card">
        <div className="section-title">Launch path</div>
        <div className="activation-phases">
          {phase(report.phases.mockReady, '1. Safe mock factory', 'Database, operator security, GENERAL channel and prompt bank.')}
          {phase(zeroCost || report.phases.creativeConfigured, '2. Creative director configured', zeroCost ? 'Local Ollama is preferred and deterministic fallback is always available.' : 'A remote planner is configured with deterministic fallback.')}
          {phase(zeroCost || report.phases.realRenderConfigured, '3. Real renderer configured', zeroCost ? 'Local FFmpeg creates persistent, playable vertical MP4 files for $0.' : 'OpenArt MCP is selected for production rendering.')}
          {phase(report.phases.privateYouTubeConfigured, '4. Private YouTube path configured', 'GENERAL channel OAuth is connected and YouTube is selected as publishing provider.')}
          {phase(report.phases.paidAutopilotReady, '5. Paid Autopilot explicitly unlocked', 'Both manual paid rendering and background Autopilot spending locks are open.')}
          {phase(report.phases.publicPublishingReady, '6. Public publishing unlocked', 'Final stage only after a PRIVATE end-to-end upload has been verified.')}
        </div>
      </section>

      <section className="grid two-col">
        <div className="card">
          <div className="section-title">Quick actions</div>
          <div className="activation-actions">
            {!coreInstalled ? (
              <ApiActionButton
                endpoint="/api/setup/bootstrap"
                body={{}}
                label="🚀 Prepare safe factory"
                confirmText="Create the safe GENERAL channel if missing and install/refresh the built-in 1,000-prompt bank? No paid service or YouTube upload will be called."
              />
            ) : <span className="badge">CORE + 1,000 PROMPTS READY</span>}

            {telegramConfigured
              ? <ApiActionButton endpoint="/api/telegram/test" body={{}} label="📨 Test Telegram" />
              : <span className="muted">Add Telegram values in the server environment, then return here.</span>}

            <a className="button secondary" href="/settings">Channel & Autopilot settings</a>
          </div>
        </div>

        <div className="card">
          <div className="section-title">YouTube channels</div>
          {report.channels.length ? <div className="list">{report.channels.map((channel) => (
            <div className="row" key={channel.id}>
              <span>
                <strong>{channel.name}</strong>
                <small className="block muted">{channel.type} · {channel.enabled ? 'enabled' : 'disabled'}</small>
                <small className="block muted">Binding: {channel.externalChannelId ?? 'not connected'}</small>
              </span>
              <span className="actions">
                <span className="badge">{channel.oauthConnected && channel.externalChannelId ? 'CONNECTED' : 'NOT CONNECTED'}</span>
                {channel.enabled && youtubeClientReady ? (
                  <a className="button secondary" href={`/api/youtube/connect?channelId=${encodeURIComponent(channel.id)}`}>
                    {channel.oauthConnected ? 'Reconnect' : 'Connect'}
                  </a>
                ) : null}
              </span>
            </div>
          ))}</div> : <p className="muted">No channel records yet. Use “Prepare safe factory” first.</p>}
        </div>
      </section>

      <section className="card">
        <div className="section-title">Activation checklist</div>
        <div className="activation-checks">
          {report.checks.map((check) => (
            <article className={`activation-check state-${check.state.toLowerCase()}`} key={check.id}>
              <div className="activation-check-icon">{icon(check.state)}</div>
              <div className="activation-check-body">
                <div className="prompt-head">
                  <strong>{check.label}</strong>
                  <span className="badge">{check.state}</span>
                </div>
                <p className="muted">{check.detail}</p>
                {check.env?.length ? <code className="env-hint">{check.env.join(' · ')}</code> : null}
                {check.href && check.actionLabel ? <div className="actions"><a className="button secondary" href={check.href}>{check.actionLabel}</a></div> : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="section-title">Safety rule</div>
        <p className="muted">A green setup page does not automatically spend credits or publish publicly. Paid rendering, paid Autopilot, YouTube upload and PUBLIC visibility remain separate explicit locks.</p>
      </section>
    </div>
  );
}
