'use client';

import { formatEur } from '@desert-web/shared';
import Link from 'next/link';
import { plural } from '@/lib/format';

/**
 * Krepšelio juosta ekrano apačioje (telefone visada matoma). „Užsakyti“ veda į užsakymą, o
 * visa likusi juosta kairėje (suvestinė ir tuščia vieta iki mygtuko) yra nuoroda atgal į
 * paskutinę atidarytą prekę, pvz. grįžus su „Pridėti kitų desertų“.
 */
export function CartBar({
  count,
  totalCents,
  href,
  summaryHref,
}: {
  count: number;
  totalCents: number;
  /** Užsakymo puslapis (su `?langas=`, kai vienu metu vyksta keli pardavimai). */
  href: string;
  /** Suvestinės nuoroda: užsakymas su paskutine atidaryta preke (`?preke=`) arba toks pat kaip `href`. */
  summaryHref: string;
}) {
  if (count === 0) return null;
  const countText = `${count} ${plural(count, ['prekė', 'prekės', 'prekių'])}`;
  const total = formatEur(totalCents);
  return (
    <div className="cart-bar" role="region" aria-label="Krepšelis">
      <div className="cart-bar-inner">
        <Link
          href={summaryHref}
          className="cart-bar-summary"
          aria-label={`Peržiūrėti krepšelį: ${countText}, ${total}`}
        >
          <span className="cart-bar-count">{countText}</span>
          <span className="cart-bar-total">{total}</span>
        </Link>
        <Link href={href} className="button primary">
          Užsakyti
        </Link>
      </div>
    </div>
  );
}
