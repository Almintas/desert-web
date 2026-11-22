'use client';

import { formatEur, type PublicSaleWindowItemDto } from '@desert-web/shared';
import { itemLabel, maxQuantity } from '@/lib/cart-logic';
import { LOW_STOCK_THRESHOLD } from '@/lib/shop';
import { AllergenLine } from './allergens';
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

/**
 * Aprašymas po varianto pavadinimu (iki 2 eilučių). Atskiras gabalas: jei aprašymų kortelėje
 * neberodysim, užtenka išimti šį komponentą ir .product-description stilių.
 */
function ProductDescription({ text }: { text: string }) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return (
    <p className="product-description" title={trimmed}>
      {trimmed}
    </p>
  );
}

/**
 * Alergenai po kiekio pasirinkimu, kai prekė jau krepšelyje. Vieta plačiame ekrane rezervuota
 * iš anksto (tekstas tik permatomas), kad eilutėje esančios kortelės nepašoktų; siaurame
 * (vienas stulpelis) eilutė išsiskleidžia. Ekrano skaitytuvai alergenus girdi visada.
 */
function AllergenReveal({ allergens, shown }: { allergens: string[]; shown: boolean }) {
  if (allergens.length === 0) return null;
  return (
    <div className="allergen-reveal" data-shown={shown}>
      <div className="allergen-reveal-inner">
        <AllergenLine allergens={allergens} />
      </div>
    </div>
  );
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
        <ProductDescription text={item.description} />
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
              <AllergenReveal allergens={item.allergens} shown={cart.quantity > 0} />
            </div>
          )
        ) : null}
      </div>
    </li>
  );
}
