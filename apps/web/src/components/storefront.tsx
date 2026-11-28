'use client';

import type { PublicSaleWindowDto } from '@desert-web/shared';
import { useCart } from '@/lib/cart-store';
import { useLastProduct } from '@/lib/last-product';
import { cartBarHref, checkoutHref } from '@/lib/links';
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
  const lastProductId = useLastProduct(saleWindow.id);
  const orderHref = checkoutHref(saleWindow.id, openCount);
  // Kol sessionStorage neperskaitytas (hidratacija), suvestinė veda ten pat, kur „Užsakyti“.
  const summaryHref =
    lastProductId === undefined
      ? orderHref
      : cartBarHref({
          windowId: saleWindow.id,
          openCount,
          itemVariantIds: saleWindow.items.map((i) => i.variantId),
          lastProductId,
          cartLines: cart.lines,
        });
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
        href={orderHref}
        summaryHref={summaryHref}
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
