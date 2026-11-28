'use client';

import { formatEur } from '@desert-web/shared';
import Link from 'next/link';
import { plural } from '@/lib/format';

/**
 * Krepšelio juosta ekrano apačioje (telefone visada matoma). Mygtukas „Užsakyti“ veda į
 * užsakymą, o paspaudus bet kur kitur juostoje grįžtama į paskutinį žiūrėtą užsakymo puslapį
 * (su ta pačia preke), pvz. po „Pridėti kitų desertų“.
 */
export function CartBar({
  count,
  totalCents,
  href,
  returnHref,
}: {
  count: number;
  totalCents: number;
  /** Užsakymo puslapis (su `?langas=`, kai vienu metu vyksta keli pardavimai). */
  href: string;
  /** Paskutinis aplankytas užsakymo puslapis (su `?preke=`); jei jo nebuvo, toks pat kaip `href`. */
  returnHref: string;
}) {
  if (count === 0) return null;
  const countText = `${count} ${plural(count, ['prekė', 'prekės', 'prekių'])}`;
  const total = formatEur(totalCents);
  return (
    <div className="cart-bar" role="region" aria-label="Krepšelis">
      <div className="cart-bar-inner">
        <Link
          href={returnHref}
          className="cart-bar-summary"
          aria-label={`Krepšelis: ${countText}, ${total}. Grįžti į užsakymą`}
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
