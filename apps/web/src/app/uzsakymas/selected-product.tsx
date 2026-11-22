'use client';

import { cloudinaryImageUrl, formatEur, type PublicSaleWindowItemDto } from '@desert-web/shared';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AllergenLine } from '@/components/allergens';
import { ProductImage } from '@/components/product-image';
import { Stepper } from '@/components/stepper';
import { itemLabel, maxQuantity } from '@/lib/cart-logic';
import { limitHint, stockClass, stockText } from '@/lib/item-status';

/** Užsakymo puslapyje nuotrauka iki ~300 px (plačiau) arba per visą plotį (telefone). */
const IMAGE_SIZES = '(max-width: 599px) calc(100vw - 66px), 300px';

/**
 * Prekė, kurią pirkėjas atsidarė paspaudęs kortelę (`?preke=<variantId>`): nuotraukos, pilnas
 * aprašymas, alergenai ir visi to paties produkto variantai šiame lange su kiekio pasirinkimu.
 * Kiekis keičiamas tame pačiame krepšelyje, kaip ir pagrindiniame puslapyje.
 */
export function SelectedProduct({
  variants,
  giftWrapAvailable,
  selectedVariantId,
  quantityOf,
  setQuantity,
  backHref,
}: {
  /** To paties produkto variantai šiame lange (lango tvarka), tarp jų ir pasirinktas. */
  variants: PublicSaleWindowItemDto[];
  /** Lange įjungtas dovanų pakavimas (pats pasirinkimas yra krepšelio eilutėje). */
  giftWrapAvailable: boolean;
  selectedVariantId: string;
  quantityOf: (variantId: string) => number;
  setQuantity: (variantId: string, quantity: number) => void;
  backHref: string;
}) {
  const product = variants.find((v) => v.variantId === selectedVariantId) ?? variants[0]!;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [imageIndex, setImageIndex] = useState(0);
  const images = product.images;
  const image = images[Math.min(imageIndex, images.length - 1)];

  const inCart = variants.some((v) => quantityOf(v.variantId) > 0);
  const allSoldOut = variants.every((v) => v.quantityAvailable === 0);
  const choose = !inCart && !allSoldOut;
  // Paryškinam URL variantą, o jei jis išparduotas, pirmą turimą.
  const emphasised =
    variants.find((v) => v.variantId === selectedVariantId && v.quantityAvailable > 0) ??
    variants.find((v) => v.quantityAvailable > 0);

  // Užuomina apie pakavimą: viena visam produktui, o jei leidžia ne visi variantai, prie jų.
  const giftVariants = giftWrapAvailable ? variants.filter((v) => v.giftWrapAllowed) : [];
  const giftForAll = giftVariants.length > 0 && giftVariants.length === variants.length;

  // Ekrano skaitytuvams: atėjus iš kortelės, fokusas ant prekės pavadinimo (be slinkimo).
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section
      className={`checkout-section selected-product${allSoldOut ? ' sold-out' : ''}`}
      aria-labelledby="selected-heading"
    >
      <div className="selected-product-top">
        <div className="selected-product-gallery">
          <ProductImage
            image={image}
            alt={image?.alt ?? product.productName}
            eager
            priority
            sizes={IMAGE_SIZES}
          />
          {images.length > 1 ? (
            <ul className="selected-product-thumbs" aria-label="Nuotraukos">
              {images.map((img, i) => (
                <li key={img.url}>
                  <button
                    type="button"
                    className="selected-product-thumb"
                    aria-label={`Nuotrauka ${i + 1} iš ${images.length}`}
                    aria-pressed={i === imageIndex}
                    onClick={() => setImageIndex(i)}
                  >
                    <img
                      src={cloudinaryImageUrl(img.url, { width: 128, height: 96 })}
                      width={64}
                      height={48}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="selected-product-info">
          <h2 id="selected-heading" ref={headingRef} tabIndex={-1}>
            {product.productName}
          </h2>
          {product.description.trim() ? (
            <p className="selected-product-description">{product.description.trim()}</p>
          ) : null}
          <AllergenLine allergens={product.allergens} />
          {giftForAll ? <p className="gift-wrap-hint">Galima supakuoti kaip dovaną</p> : null}
        </div>
      </div>

      {choose ? (
        <p className="choose-prompt" id="choose-prompt">
          Pasirinkite kiekį
        </p>
      ) : null}
      <ul className="variant-options">
        {variants.map((v) => {
          const soldOut = v.quantityAvailable === 0;
          const quantity = quantityOf(v.variantId);
          const hint = limitHint(v, quantity);
          const classes = [
            'variant-option',
            variants.length > 1 && v.variantId === selectedVariantId ? 'selected' : '',
            choose && v === emphasised ? 'emphasis' : '',
            soldOut ? 'sold-out' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <li key={v.variantId} className={classes}>
              <div className="variant-option-text">
                <p className="variant-option-name">{v.variantName}</p>
                <p className="variant-option-meta">
                  <span className="price">{formatEur(v.priceCents)}</span>
                  {/* Išparduota rodoma vietoj kiekio pasirinkimo, antrą kartą nekartojam. */}
                  {soldOut ? null : <span className={stockClass(v)}>{stockText(v)}</span>}
                </p>
              </div>
              <div className="variant-option-control">
                {soldOut ? (
                  <p className="variant-sold-out">Išparduota</p>
                ) : (
                  <Stepper
                    label={itemLabel(v)}
                    value={quantity}
                    max={maxQuantity(v)}
                    onChange={(q) => setQuantity(v.variantId, q)}
                  />
                )}
              </div>
              {hint ? <p className="limit-hint">{hint}</p> : null}
              {!giftForAll && giftVariants.includes(v) ? (
                <p className="gift-wrap-hint">Galima supakuoti kaip dovaną</p>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="selected-product-more">
        <Link href={backHref}>+ Pridėti kitų desertų</Link>
      </p>
    </section>
  );
}
