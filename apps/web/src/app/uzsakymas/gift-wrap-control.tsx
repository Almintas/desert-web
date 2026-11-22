'use client';

import { formatEur } from '@desert-web/shared';
import { useId } from 'react';
import { Stepper } from '@/components/stepper';

/**
 * Krepšelio eilutės „Supakuoti kaip dovaną“. Vienam vienetui tik varnelė; kai vienetų daugiau,
 * pažymėjus supakuojami visi, o „Kiek supakuoti: N iš Q“ leidžia pasirinkti mažiau
 * (sumažinus iki 0, varnelė nuimama).
 */
export function GiftWrapControl({
  label,
  quantity,
  giftWrapQuantity,
  priceCents,
  onChange,
}: {
  /** Prekės pavadinimas ekrano skaitytuvams. */
  label: string;
  quantity: number;
  giftWrapQuantity: number;
  /** Pakavimo kaina už vienetą. */
  priceCents: number;
  onChange: (giftWrapQuantity: number) => void;
}) {
  const id = useId();
  const checked = giftWrapQuantity > 0;
  return (
    <div className={`gift-wrap${checked ? ' checked' : ''}`}>
      <label className="gift-wrap-toggle" htmlFor={`${id}-toggle`}>
        <input
          id={`${id}-toggle`}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked ? quantity : 0)}
        />
        <span>
          Supakuoti kaip dovaną{' '}
          <span className="gift-wrap-price">(+{formatEur(priceCents)} už vnt.)</span>
          <span className="visually-hidden">: {label}</span>
        </span>
      </label>
      {checked && quantity > 1 ? (
        <div className="gift-wrap-count">
          <span aria-hidden="true">Kiek supakuoti:</span>
          <Stepper
            compact
            label={label}
            value={giftWrapQuantity}
            max={quantity}
            onChange={onChange}
            valueSuffix={`iš ${quantity}`}
            labels={{
              group: `Kiek supakuoti kaip dovaną: ${label}`,
              decrease: `Supakuoti mažiau: ${label}`,
              increase: `Supakuoti daugiau: ${label}`,
              value: 'Supakuoti: ',
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
