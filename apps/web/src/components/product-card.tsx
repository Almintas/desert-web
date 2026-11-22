'use client';

import { formatEur, type PublicSaleWindowItemDto } from '@desert-web/shared';
import Link from 'next/link';
import { itemLabel, maxQuantity } from '@/lib/cart-logic';
import { limitHint, stockClass, stockText } from '@/lib/item-status';
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
  /**
   * Užsakymo puslapis su šia preke. Visa kortelė tampa nuoroda („stretched link“), o kiekio
   * pasirinkimas lieka virš jos. Nėra: kortelė nespaudžiama (būsimas langas).
   */
  href?: string;
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

export function ProductCard({ item, index, cart, href }: Props) {
  const label = itemLabel(item);
  const soldOut = item.quantityAvailable === 0;
  const max = maxQuantity(item);
  const hint = cart ? limitHint(item, cart.quantity) : null;

  return (
    <li className={`product-card${soldOut ? ' sold-out' : ''}${href ? ' linked' : ''}`}>
      <ProductImage
        image={item.images[0]}
        alt={item.images[0]?.alt ?? item.productName}
        eager={index < FIRST_ROW}
        priority={index === 0}
      />
      <div className="product-body">
        <h3 className="product-name">
          {href ? (
            <Link
              href={href}
              className="product-link"
              aria-label={`${item.productName}, ${item.variantName} – peržiūrėti ir užsakyti`}
            >
              {item.productName}
            </Link>
          ) : (
            item.productName
          )}
        </h3>
        <p className="product-variant">{item.variantName}</p>
        <ProductDescription text={item.description} />
        <div className="product-meta">
          <span className="price">{formatEur(item.priceCents)}</span>
          {cart ? <span className={stockClass(item)}>{stockText(item)}</span> : null}
        </div>
        {cart ? (
          soldOut ? (
            <button type="button" className="button sold-out-button" disabled>
              Išparduota
            </button>
          ) : (
            <div className="product-actions">
              <Stepper label={label} value={cart.quantity} max={max} onChange={cart.onChange} />
              {hint ? <p className="limit-hint">{hint}</p> : null}
              <AllergenReveal allergens={item.allergens} shown={cart.quantity > 0} />
            </div>
          )
        ) : null}
      </div>
    </li>
  );
}
