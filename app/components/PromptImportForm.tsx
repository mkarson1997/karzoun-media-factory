'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function PromptImportForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/prompts/import', { method: 'POST', body: formData });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Import failed');
      const s = payload.summary as { imported: number; updated: number; rejected: number; total: number };
      setMessage(`Done: ${s.imported} imported, ${s.updated} updated, ${s.rejected} rejected, ${s.total} total.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form-stack" action={submit}>
      <div className="section-title">Import prompt bank</div>
      <p className="muted">Upload the 1,000-prompt CSV directly from your phone or computer. Existing prompt IDs update safely.</p>
      <input className="input file-input" type="file" name="file" accept=".csv,text/csv" required />
      <button className="button" type="submit" disabled={busy}>{busy ? 'Importing…' : 'Import CSV'}</button>
      {message ? <p className="muted">{message}</p> : null}
    </form>
  );
}
