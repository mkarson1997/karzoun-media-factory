'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ScheduleForm({
  jobId,
  defaultTitle = '',
  defaultDescription = '',
  defaultTimezone = 'Europe/Istanbul',
  defaultPublishLocal = '',
  suggestionReason
}: {
  jobId: string;
  defaultTitle?: string;
  defaultDescription?: string;
  defaultTimezone?: string;
  defaultPublishLocal?: string;
  suggestionReason?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setBusy(true);
    setMessage(null);
    try {
      const publishLocal = String(formData.get('publishAt'));
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(publishLocal)) throw new Error('Choose a valid publish date and time');
      const hashtags = String(formData.get('hashtags') || '').split(/[\s,]+/).map((v) => v.trim()).filter(Boolean);
      const response = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jobId,
          publishLocal,
          timezone: String(formData.get('timezone')),
          visibility: String(formData.get('visibility')),
          title: String(formData.get('title') || ''),
          description: String(formData.get('description') || ''),
          hashtags
        })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Scheduling failed');
      setMessage('Scheduled. Publishing safety locks still apply.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Scheduling failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form-stack" action={submit}>
      {suggestionReason ? <div className="notice"><strong>Smart suggestion</strong><br/>{suggestionReason}</div> : null}
      <label>Publish date & time<input className="input" type="datetime-local" name="publishAt" defaultValue={defaultPublishLocal} required /></label>
      <label>Timezone<input className="input" name="timezone" defaultValue={defaultTimezone} required /></label>
      <label>Visibility<select className="input" name="visibility" defaultValue="PRIVATE"><option>PRIVATE</option><option>UNLISTED</option><option>PUBLIC</option></select></label>
      <label>Title<input className="input" name="title" maxLength={100} defaultValue={defaultTitle} /></label>
      <label>Description<textarea className="input textarea" name="description" maxLength={5000} defaultValue={defaultDescription} /></label>
      <label>Hashtags<input className="input" name="hashtags" placeholder="#Shorts #AI #Science" /></label>
      <button className="button" type="submit" disabled={busy}>{busy ? 'Scheduling…' : 'Schedule video'}</button>
      {message ? <p className="muted">{message}</p> : null}
    </form>
  );
}
