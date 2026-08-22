import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'Karzoun Media Factory',
  description: 'Mobile-first AI short-video production control center'
};

const nav = [
  ['Dashboard', '/dashboard'],
  ['Prompts', '/prompts'],
  ['Queue', '/queue'],
  ['Review', '/review'],
  ['Schedule', '/schedule'],
  ['Analytics', '/analytics'],
  ['Setup', '/setup'],
  ['Settings', '/settings']
] as const;

function runtimeLabel() {
  const video = process.env.VIDEO_PROVIDER || 'mock';
  const publishing = process.env.PUBLISHING_PROVIDER || 'mock';
  const mockOnly = (video === 'mock' || video === 'mock-demo') && publishing === 'mock';
  if (mockOnly) return 'SAFE MOCK';

  const armed = process.env.ALLOW_PAID_GENERATION === 'true' || process.env.ALLOW_YOUTUBE_UPLOAD === 'true';
  return armed ? 'LIVE ARMED' : 'LIVE LOCKED';
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <header className="topbar">
            <a href="/dashboard">
              <div className="eyebrow">KARZOUN</div>
              <div className="brand">Media Factory</div>
            </a>
            <a className="status-dot" href="/setup" title="Open activation wizard">{runtimeLabel()}</a>
          </header>
          <main>{children}</main>
          <nav className="bottom-nav" aria-label="Primary factory navigation">
            {nav.map(([label, href]) => (
              <a key={href} href={href}>{label}</a>
            ))}
          </nav>
        </div>
      </body>
    </html>
  );
}
