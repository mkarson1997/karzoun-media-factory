'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function AutoRefresh({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), Math.max(2, seconds) * 1000);
    return () => window.clearInterval(timer);
  }, [router, seconds]);

  return <span className="live-refresh" title={`Refreshes every ${seconds}s`}>● LIVE · {seconds}s</span>;
}
