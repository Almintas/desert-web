import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Desert Web · Admin',
  robots: { index: false, follow: false },
};

const NAV = [
  { href: '/', label: 'Apžvalga' },
  { href: '/sale-windows', label: 'Pardavimo langai' },
  { href: '/products', label: 'Produktai' },
  { href: '/orders', label: 'Užsakymai' },
  { href: '/special-orders', label: 'Specialūs užsakymai' },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="lt">
      <body>
        <div className="shell">
          <aside className="sidebar">
            <p className="brand">Desert Web</p>
            <nav>
              {NAV.map((item) => (
                <Link key={item.href} href={item.href}>
                  {item.label}
                </Link>
              ))}
            </nav>
          </aside>
          <main className="content">{children}</main>
        </div>
      </body>
    </html>
  );
}
