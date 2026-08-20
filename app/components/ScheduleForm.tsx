'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ScheduleForm({ jobId, defaultTitle = '', defaultDescription = '', defaultTimezone = 'Europe/Istanbul' }: {
  jobId: string;
  defaultTitle?: string;
  defaultDescription?: string;
  defaultTimezone?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setBusy(true);
    setMessage(null);
    try {
      const localDate = String(formData.get('publishAt'));
      const date = new Date(localDate);
      if (Number.isNaN(date.getTime())) throw new Error('Choose a valid publish date and time');
      const hashtags = String(formData.get('hashtags') || '').split(/[\s,]+/).map((v) => v.trim()).filter(Boolean);
      const response = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jobId,
          publishAt: date.toISOString(),
          timezone: String(formData.get('timezone')),
          visibility: String(formData.get('visibility')),
          title: String(formData.get('title') || ''),
          description: String(formData.get('description') || ''),
          hashtags
        })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Scheduling failed');
      setMessage('Scheduled in the internal queue. Real YouTube publishing is still disabled.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Scheduling failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form-stack" action={submit}>
      <label>Publish date & time<input className="input" type="datetime-local" name="publishAt" required /></label>
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
