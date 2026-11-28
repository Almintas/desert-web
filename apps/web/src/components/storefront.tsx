'use client';

import type { PublicSaleWindowDto } from '@desert-web/shared';
import { useCart } from '@/lib/cart-store';
import { useLastCheckoutVariant } from '@/lib/last-checkout';
import { checkoutHref } from '@/lib/links';
import { CartBar } from './cart-bar';
import { ProductCard } from './product-card';

/** 1–2 prekės: stulpeliai siauresni ir centruoti, kad kortelė nestovėtų viena kairėje. */
const gridClass = (count: number) =>
  count < 3 ? `product-grid product-grid-${count}` : 'product-grid';

/** Atidaryto lango prekės su krepšeliu. */
export function Storefront({
  saleWindow,
  openCount,
}: {
  saleWindow: PublicSaleWindowDto;
  /** Kiek langų atidaryta dabar: jei daugiau nei vienas, užsakymo nuoroda nurodo langą. */
  openCount: number;
}) {
  const cart = useCart(saleWindow);
  const lastVariant = useLastCheckoutVariant(saleWindow.id);
  const returnVariant = saleWindow.items.some((i) => i.variantId === lastVariant)
    ? (lastVariant ?? undefined)
    : undefined;
  return (
    <>
      {cart.loadChanges.length > 0 ? (
        <div className="alert info" role="status">
          <p className="alert-title">Krepšelis atnaujintas pagal dabartinius likučius:</p>
          <ul>
            {cart.loadChanges.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <button type="button" className="link-button" onClick={cart.dismissLoadChanges}>
            Gerai
          </button>
        </div>
      ) : null}
      <ul className={gridClass(saleWindow.items.length)}>
        {saleWindow.items.map((item, index) => (
          <ProductCard
            key={item.variantId}
            item={item}
            index={index}
            href={checkoutHref(saleWindow.id, openCount, item.variantId)}
            cart={{
              quantity: cart.quantityOf(item.variantId),
              onChange: (q) => cart.setQuantity(item.variantId, q),
            }}
          />
        ))}
      </ul>
      {cart.count > 0 ? <div className="cart-bar-spacer" aria-hidden="true" /> : null}
      <CartBar
        count={cart.count}
        totalCents={cart.totalCents}
        href={checkoutHref(saleWindow.id, openCount)}
        returnHref={checkoutHref(saleWindow.id, openCount, returnVariant)}
      />
    </>
  );
}

/** Būsimo lango prekės tik peržiūrai. */
export function UpcomingProducts({ saleWindow }: { saleWindow: PublicSaleWindowDto }) {
  return (
    <ul className={gridClass(saleWindow.items.length)}>
      {saleWindow.items.map((item, index) => (
        <ProductCard key={item.variantId} item={item} index={index} cart={null} />
      ))}
    </ul>
  );
}
