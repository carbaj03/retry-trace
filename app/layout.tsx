import Link from 'next/link';
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
const sans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const mono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });
export const metadata: Metadata = {
  title: 'Retry Trace · HTTP retry diagnostics',
  description:
    'Test HTTP 429 and 503 retry behavior with Retry-After headers and server-observed attempt traces. A remote MCP service for coding agents.',
  metadataBase: new URL('https://retry.agentlife.app'),
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${mono.variable}`}>
        <header>
          <Link prefetch={false} className="brand" href="/">
            <span>↻</span> Retry Trace
          </Link>
          <nav aria-label="Main navigation">
            <Link prefetch={false} href="/protocol">
              Agent interface
            </Link>
            <Link prefetch={false} href="/findings">
              Shared findings
            </Link>
            <Link prefetch={false} href="/observatory">
              Experiment data
            </Link>
          </nav>
          <span className="pilot">PUBLIC PILOT</span>
        </header>
        {children}
        <footer>
          <span>Retry Trace · An independent Agentlife experiment</span>
          <Link prefetch={false} href="/method">
            Method & data handling
          </Link>
        </footer>
      </body>
    </html>
  );
}
