'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ChannelForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [type, setType] = useState<'GENERAL' | 'KIDS_CHANNEL_ONLY'>('KIDS_CHANNEL_ONLY');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, type })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Could not create channel');
      setName('');
      setMessage('Channel added. Connect its YouTube account below.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create channel');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid" onSubmit={submit}>
      <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Factory channel name" minLength={2} maxLength={80} required />
      <select className="input" value={type} onChange={(event) => setType(event.target.value as 'GENERAL' | 'KIDS_CHANNEL_ONLY')}>
        <option value="KIDS_CHANNEL_ONLY">Kids channel</option>
        <option value="GENERAL">General channel</option>
      </select>
      <button className="button" type="submit" disabled={busy}>{busy ? 'Adding…' : 'Add channel'}</button>
      {message ? <small className="muted">{message}</small> : null}
    </form>
  );
}
