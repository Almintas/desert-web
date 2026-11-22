'use client';

import { formatEur, type PublicSaleWindowItemDto } from '@desert-web/shared';
import { itemLabel, maxQuantity } from '@/lib/cart-logic';
import { LOW_STOCK_THRESHOLD } from '@/lib/shop';
import { ProductImage } from './product-image';
import { Stepper } from './stepper';

/** Kiek kortelių telpa pirmoje eilėje plačiausiame ekrane (jos įkeliamos ne lazy). */
const FIRST_ROW = 3;

interface Props {
  item: PublicSaleWindowItemDto;
  index: number;
  /** null: tik peržiūra (būsimas langas). */
  cart: { quantity: number; onChange: (q: number) => void } | null;
}

function stockText(available: number): string {
  if (available === 0) return 'Išparduota';
  if (available <= LOW_STOCK_THRESHOLD) return `Liko ${available}`;
  return 'Yra';
}

export function ProductCard({ item, index, cart }: Props) {
  const label = itemLabel(item);
  const soldOut = item.quantityAvailable === 0;
  const max = maxQuantity(item);
  const low = !soldOut && item.quantityAvailable <= LOW_STOCK_THRESHOLD;

  return (
    <li className={`product-card${soldOut ? ' sold-out' : ''}`}>
      <ProductImage
        image={item.images[0]}
        alt={item.images[0]?.alt ?? item.productName}
        eager={index < FIRST_ROW}
        priority={index === 0}
      />
      <div className="product-body">
        <h3 className="product-name">{item.productName}</h3>
        <p className="product-variant">{item.variantName}</p>
        <div className="product-meta">
          <span className="price">{formatEur(item.priceCents)}</span>
          {cart ? (
            <span className={`stock${low ? ' low' : ''}${soldOut ? ' none' : ''}`}>
              {stockText(item.quantityAvailable)}
            </span>
          ) : null}
        </div>
        {cart ? (
          soldOut ? (
            <button type="button" className="button sold-out-button" disabled>
              Išparduota
            </button>
          ) : (
            <div className="product-actions">
              <Stepper label={label} value={cart.quantity} max={max} onChange={cart.onChange} />
              {cart.quantity > 0 && cart.quantity >= max ? (
                <p className="limit-hint">
                  {item.maxPerOrder && item.maxPerOrder < item.quantityAvailable
                    ? `Vienu užsakymu daugiausia ${item.maxPerOrder} vnt.`
                    : 'Daugiau neturime'}
                </p>
              ) : null}
            </div>
          )
        ) : null}
      </div>
    </li>
  );
}
