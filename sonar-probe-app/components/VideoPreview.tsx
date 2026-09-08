'use client';

import { useState } from 'react';

export function VideoPreview({ src, poster, providerStatus, creationId }: { src: string; poster?: string; providerStatus?: string | null; creationId?: string | null }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <div className="video-placeholder">MEDIA FAILED TO LOAD<br/><small>Status: {providerStatus || 'unknown'} · Creation: {creationId || 'n/a'}</small></div>;
  }
  return <video controls playsInline preload="metadata" poster={poster} src={src} onError={() => setFailed(true)} />;
}
