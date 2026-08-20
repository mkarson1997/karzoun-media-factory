import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'Karzoun Media Factory',
  description: 'Mobile-first AI short-video production control center'
};

const nav = [
  ['Dashboard', '/dashboard'],
  ['Queue', '/queue'],
  ['Review', '/review'],
  ['Analytics', '/analytics'],
  ['Settings', '/settings']
] as const;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <header className="topbar">
            <div>
              <div className="eyebrow">KARZOUN</div>
              <div className="brand">Media Factory</div>
            </div>
            <span className="status-dot">Mock Mode</span>
          </header>
          <main>{children}</main>
          <nav className="bottom-nav" aria-label="Primary">
            {nav.map(([label, href]) => (
              <a key={href} href={href}>{label}</a>
            ))}
          </nav>
        </div>
      </body>
    </html>
  );
}
