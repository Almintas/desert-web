import Link from 'next/link';
import type { ReactNode } from 'react';
import { Wordmark } from '@/components/wordmark';
import { requireAdmin } from '@/lib/dal';
import { logoutAction } from './actions';

const NAV = [
  { href: '/', label: 'Apžvalga' },
  { href: '/sale-windows', label: 'Pardavimo langai' },
  { href: '/products', label: 'Produktai' },
  { href: '/orders', label: 'Užsakymai' },
  { href: '/special-orders', label: 'Specialūs užsakymai' },
];

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();

  return (
    <div className="shell">
      <aside className="sidebar">
        <Wordmark />
        <nav>
          {NAV.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="account">
          <p className="muted" title={admin.email}>
            {admin.email}
          </p>
          <form action={logoutAction}>
            <button type="submit" className="button secondary">
              Atsijungti
            </button>
          </form>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
