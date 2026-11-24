import Link from 'next/link';
import type { ReactNode } from 'react';
import { Wordmark } from '@/components/wordmark';
import { requireAdmin } from '@/lib/dal';
import { logoutAction } from './actions';
import { fetchRequestedCount } from './special-orders/data';

const NAV = [
  { href: '/', label: 'Apžvalga' },
  { href: '/sale-windows', label: 'Pardavimo langai' },
  { href: '/products', label: 'Produktai' },
  { href: '/orders', label: 'Užsakymai' },
  { href: '/special-orders', label: 'Specialūs užsakymai' },
  { href: '/settings', label: 'Nustatymai' },
];

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();
  // Naujų specialių užsakymų skaičius (layout'as perpiešiamas ne kiekvienos navigacijos metu,
  // todėl skaičius atsinaujina perkrovus ar po veiksmo su redirect).
  const requestedCount = await fetchRequestedCount();

  return (
    <div className="shell">
      <aside className="sidebar">
        <Wordmark />
        <nav>
          {NAV.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
              {item.href === '/special-orders' && requestedCount ? (
                <span className="nav-count" title={`Naujos užklausos: ${requestedCount}`}>
                  {requestedCount}
                </span>
              ) : null}
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
