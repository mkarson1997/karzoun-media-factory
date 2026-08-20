'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ApiActionButton({ endpoint, body, label, confirmText, className = 'button' }: {
  endpoint: string;
  body: Record<string, unknown>;
  label: string;
  confirmText?: string;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Action failed');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="action-wrap">
      <button className={className} type="button" onClick={run} disabled={busy}>
        {busy ? 'Working…' : label}
      </button>
      {error ? <small className="action-error">{error}</small> : null}
    </span>
  );
}
