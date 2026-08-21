'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiActionButton } from './ApiActionButton';

type Settings = {
  projectName: string;
  timezone: string;
  defaultLanguage: string;
  dailyProductionLimit: number;
  dailyPublishingLimit: number;
  autopilotEnabled: boolean;
  autopilotGeneralDailyTarget: number;
  autopilotKidsEnabled: boolean;
  autopilotKidsDailyTarget: number;
};

export function SettingsForm({ settings }: { settings: Settings }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(formData: FormData) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectName: String(formData.get('projectName')),
          timezone: String(formData.get('timezone')),
          defaultLanguage: String(formData.get('defaultLanguage')),
          dailyProductionLimit: Number(formData.get('dailyProductionLimit')),
          dailyPublishingLimit: Number(formData.get('dailyPublishingLimit')),
          autopilotEnabled: formData.get('autopilotEnabled') === 'on',
          autopilotGeneralDailyTarget: Number(formData.get('autopilotGeneralDailyTarget')),
          autopilotKidsEnabled: formData.get('autopilotKidsEnabled') === 'on',
          autopilotKidsDailyTarget: Number(formData.get('autopilotKidsDailyTarget'))
        })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Save failed');
      setMessage('Saved.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid">
      <form className="card form-stack" action={save}>
        <div className="section-title">General</div>
        <label>Project name<input className="input" name="projectName" defaultValue={settings.projectName} /></label>
        <label>Timezone<input className="input" name="timezone" defaultValue={settings.timezone} /></label>
        <label>Default language<input className="input" name="defaultLanguage" defaultValue={settings.defaultLanguage} /></label>
        <label>Daily production limit<input className="input" type="number" min="1" max="50" name="dailyProductionLimit" defaultValue={settings.dailyProductionLimit} /></label>
        <label>Daily publishing limit<input className="input" type="number" min="1" max="20" name="dailyPublishingLimit" defaultValue={settings.dailyPublishingLimit} /></label>

        <div className="section-title">Autopilot</div>
        <p className="muted">Autopilot only queues unused prompts. It never auto-approves a generated video and it cannot bypass the paid-generation lock.</p>
        <label className="checkbox-row"><input type="checkbox" name="autopilotEnabled" defaultChecked={settings.autopilotEnabled} /> Enable general autopilot</label>
        <label>General videos / rolling 24h<input className="input" type="number" min="0" max="20" name="autopilotGeneralDailyTarget" defaultValue={settings.autopilotGeneralDailyTarget} /></label>
        <label className="checkbox-row"><input type="checkbox" name="autopilotKidsEnabled" defaultChecked={settings.autopilotKidsEnabled} /> Enable kids autopilot</label>
        <label>Kids videos / rolling 24h<input className="input" type="number" min="0" max="20" name="autopilotKidsDailyTarget" defaultValue={settings.autopilotKidsDailyTarget} /></label>

        <button className="button" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
        {message ? <p className="muted">{message}</p> : null}
      </form>

      <div className="card">
        <div className="section-title">Telegram</div>
        <p className="muted">The bot token and allowed user ID stay server-side and are never displayed here.</p>
        <ApiActionButton endpoint="/api/telegram/test" body={{}} label="Send test notification" />
      </div>
    </div>
  );
}
