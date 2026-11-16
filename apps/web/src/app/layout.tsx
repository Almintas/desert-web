import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Desert Web',
  description: 'Makaronai ir kiti desertai. Užsakymai tik pardavimo metu.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="lt">
      <body>
        <header className="site-header">
          <Link href="/" className="logo">
            Desert Web
          </Link>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
