import type { Metadata } from 'next';
import Link from 'next/link';
import { shopConfig } from '@/lib/config';
import './globals.css';

export const metadata: Metadata = {
  title: `${shopConfig.shopName} | Trending finds, shipped to you`,
  description: 'An online shop run by AI agents: they find trending products, list them, and ship from the supplier.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-white/10 bg-charcoal/80 backdrop-blur">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
            <Link href="/" className="text-xl font-bold text-white">
              {shopConfig.shopName}
              <span className="text-accent">.</span>
            </Link>
            <Link
              href="/admin"
              className="rounded-full border border-white/15 px-4 py-1.5 text-sm text-slate-300 hover:border-accent hover:text-white"
            >
              Agent control room
            </Link>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-10">{children}</main>
      </body>
    </html>
  );
}
