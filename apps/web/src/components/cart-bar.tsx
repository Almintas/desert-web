'use client';

import { formatEur } from '@desert-web/shared';
import Link from 'next/link';
import { plural } from '@/lib/format';

/** Krepšelio juosta ekrano apačioje (telefone visada matoma). */
export function CartBar({ count, totalCents }: { count: number; totalCents: number }) {
  if (count === 0) return null;
  return (
    <div className="cart-bar" role="region" aria-label="Krepšelis">
      <div className="cart-bar-inner">
        <p className="cart-bar-summary">
          <span className="cart-bar-count">
            {count} {plural(count, ['prekė', 'prekės', 'prekių'])}
          </span>
          <span className="cart-bar-total">{formatEur(totalCents)}</span>
        </p>
        <Link href="/uzsakymas" className="button primary">
          Užsakyti
        </Link>
      </div>
    </div>
  );
}
