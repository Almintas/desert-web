'use client';

import {
  type AdminSaleWindowDto,
  centsToInput,
  formatShopDateTime,
  parseEurToCents,
  utcToVilniusLocal,
} from '@desert-web/shared';
import Link from 'next/link';
import { type FormEvent, startTransition, useActionState, useRef, useState } from 'react';
import { saveSaleWindowAction } from './actions';
import type { ProductOption, SaleWindowFormState } from './form-state';

interface ItemRow {
  /** React key (stabilus net pašalinus eilutę). */
  key: string;
  /** Esama lango prekė: produkto ir varianto keisti negalima (tapatybė yra variantId). */
  existing: boolean;
  productId: string;
  variantId: string;
  productLabel: string;
  variantLabel: string;
  price: string;
  quantityTotal: string;
  maxPerOrder: string;
  maxPerCustomer: string;
  sold: number;
  ordersCount: number;
}

interface Props {
  /** null: naujas langas. */
  windowId: string | null;
  initial?: AdminSaleWindowDto;
  products: ProductOption[];
}

const INVALID_PRICE = 'Netinkama kaina (pvz., 12,50)';

function FieldError({ message }: { message?: string }) {
  return message ? <span className="field-error">{message}</span> : null;
}

export function SaleWindowForm({ windowId, initial, products }: Props) {
  const action = saveSaleWindowAction.bind(null, windowId);
  const [state, dispatch, pending] = useActionState<SaleWindowFormState, FormData>(action, {});
  const keySeq = useRef(0);
  const nextKey = () => `item-${keySeq.current++}`;
  const activeProducts = products.filter((p) => p.isActive);

  const [title, setTitle] = useState(initial?.title ?? '');
  const [opensAt, setOpensAt] = useState(initial ? utcToVilniusLocal(initial.opensAt) : '');
  const [closesAt, setClosesAt] = useState(initial ? utcToVilniusLocal(initial.closesAt) : '');
  const f = initial?.fulfillment;
  const [pickupAvailable, setPickupAvailable] = useState(f?.pickupAvailable ?? true);
  const [pickupLocation, setPickupLocation] = useState(f?.pickupLocation ?? '');
  const [pickupFrom, setPickupFrom] = useState(
    f?.pickupFrom ? utcToVilniusLocal(f.pickupFrom) : '',
  );
  const [pickupTo, setPickupTo] = useState(f?.pickupTo ? utcToVilniusLocal(f.pickupTo) : '');
  const [deliveryAvailable, setDeliveryAvailable] = useState(f?.deliveryAvailable ?? false);

  const emptyRow = (): ItemRow => ({
    key: nextKey(),
    existing: false,
    productId: '',
    variantId: '',
    productLabel: '',
    variantLabel: '',
    price: '',
    quantityTotal: '',
    maxPerOrder: '',
    maxPerCustomer: '',
    sold: 0,
    ordersCount: 0,
  });
  const [items, setItems] = useState<ItemRow[]>(() =>
    initial
      ? initial.items.map((i) => ({
          key: nextKey(),
          existing: true,
          productId: i.productId,
          variantId: i.variantId,
          productLabel: i.productActive ? i.productName : `${i.productName} (archyvuotas)`,
          variantLabel: i.variantName,
          price: centsToInput(i.priceCents),
          quantityTotal: String(i.quantityTotal),
          maxPerOrder: i.maxPerOrder ? String(i.maxPerOrder) : '',
          maxPerCustomer: i.maxPerCustomer ? String(i.maxPerCustomer) : '',
          sold: i.sold,
          ordersCount: i.ordersCount,
        }))
      : [emptyRow()],
  );

  const errors = state.fieldErrors ?? {};
  const usedVariants = new Set(items.map((i) => i.variantId).filter(Boolean));

  function updateItem(key: string, patch: Partial<ItemRow>) {
    setItems((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function selectProduct(row: ItemRow, productId: string) {
    const product = activeProducts.find((p) => p.id === productId);
    // Vienas variantas: pasirenkamas iškart.
    const only = product?.variants.length === 1 ? product.variants[0] : undefined;
    updateItem(row.key, {
      productId,
      variantId: only?.id ?? '',
      price: only ? centsToInput(only.priceCents) : row.price,
    });
  }

  function selectVariant(row: ItemRow, variantId: string) {
    const variant = activeProducts
      .find((p) => p.id === row.productId)
      ?.variants.find((v) => v.id === variantId);
    // Kaina užpildoma bazine varianto kaina; ją galima pakeisti.
    updateItem(row.key, {
      variantId,
      price: variant ? centsToInput(variant.priceCents) : row.price,
    });
  }

  // Valdomi laukai + rankinis dispatch: React neišvalo formos, todėl po klaidos įvestis lieka.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  }

  return (
    <form className="form window-form" onSubmit={onSubmit} noValidate>
      {state.error ? (
        <div className="alert error" role="alert">
          <p>{state.error}</p>
          {state.overlap ? (
            <p>
              Kertasi su:{' '}
              <Link href={`/sale-windows/${state.overlap.id}`} className="strong">
                {state.overlap.title}
              </Link>{' '}
              ({formatShopDateTime(state.overlap.opensAt)} –{' '}
              {formatShopDateTime(state.overlap.closesAt)})
            </p>
          ) : null}
        </div>
      ) : null}

      <fieldset>
        <legend>Langas</legend>
        <label>
          Pavadinimas
          <input
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="pvz., Kalėdinis pardavimas"
            aria-invalid={Boolean(errors.title)}
          />
          <FieldError message={errors.title} />
        </label>
        <div className="grid-2">
          <label>
            Atidaroma
            <input
              type="datetime-local"
              name="opensAt"
              value={opensAt}
              onChange={(e) => setOpensAt(e.target.value)}
              aria-invalid={Boolean(errors.opensAt)}
            />
            <FieldError message={errors.opensAt} />
          </label>
          <label>
            Uždaroma
            <input
              type="datetime-local"
              name="closesAt"
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
              aria-invalid={Boolean(errors.closesAt)}
            />
            <FieldError message={errors.closesAt} />
          </label>
        </div>
        <p className="hint">
          Laikas visada nurodomas Lietuvos laiku (Europe/Vilnius), nepriklausomai nuo tavo
          kompiuterio laiko juostos. Užsakymai priimami nuo atidarymo iki uždarymo.
        </p>
      </fieldset>

      <fieldset>
        <legend>Atsiėmimas ir pristatymas</legend>
        <label className="checkbox">
          <input
            type="checkbox"
            name="fulfillment.pickupAvailable"
            checked={pickupAvailable}
            onChange={(e) => setPickupAvailable(e.target.checked)}
          />
          Galima atsiimti
        </label>
        {pickupAvailable ? (
          <>
            <label>
              Atsiėmimo vieta
              <input
                name="fulfillment.pickupLocation"
                value={pickupLocation}
                onChange={(e) => setPickupLocation(e.target.value)}
                maxLength={300}
                placeholder="pvz., Gedimino pr. 1, Vilnius"
                aria-invalid={Boolean(errors['fulfillment.pickupLocation'])}
              />
              <FieldError message={errors['fulfillment.pickupLocation']} />
            </label>
            <div className="grid-2">
              <label>
                Atsiimti nuo
                <input
                  type="datetime-local"
                  name="fulfillment.pickupFrom"
                  value={pickupFrom}
                  onChange={(e) => setPickupFrom(e.target.value)}
                  aria-invalid={Boolean(errors['fulfillment.pickupFrom'])}
                />
                <FieldError message={errors['fulfillment.pickupFrom']} />
              </label>
              <label>
                Atsiimti iki
                <input
                  type="datetime-local"
                  name="fulfillment.pickupTo"
                  value={pickupTo}
                  onChange={(e) => setPickupTo(e.target.value)}
                  aria-invalid={Boolean(errors['fulfillment.pickupTo'])}
                />
                <FieldError message={errors['fulfillment.pickupTo']} />
              </label>
            </div>
            <p className="hint">Neprivaloma. Taip pat Lietuvos laiku.</p>
          </>
        ) : null}
        <label className="checkbox">
          <input
            type="checkbox"
            name="fulfillment.deliveryAvailable"
            checked={deliveryAvailable}
            onChange={(e) => setDeliveryAvailable(e.target.checked)}
          />
          Galimas pristatymas
        </label>
        <FieldError message={errors.fulfillment} />
      </fieldset>

      <fieldset>
        <legend>Prekės</legend>
        <div className="table-wrap">
          <table className="table items-table">
            <thead>
              <tr>
                <th scope="col">Prekė</th>
                <th scope="col">Kaina, €</th>
                <th scope="col">Kiekis</th>
                <th scope="col">Maks. užsakymui</th>
                <th scope="col">Maks. pirkėjui</th>
                <th scope="col">
                  <span className="visually-hidden">Veiksmai</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((row, i) => {
                const product = activeProducts.find((p) => p.id === row.productId);
                const priceError =
                  row.price.trim() !== '' && parseEurToCents(row.price) === null
                    ? INVALID_PRICE
                    : errors[`items.${i}.priceCents`];
                const qty = Number(row.quantityTotal);
                const belowSold =
                  row.existing &&
                  row.quantityTotal !== '' &&
                  Number.isInteger(qty) &&
                  qty < row.sold
                    ? `Ne mažiau nei parduota (${row.sold})`
                    : undefined;
                const prefix = `items.${i}`;
                return (
                  <tr key={row.key}>
                    <td className="item-cell">
                      {/* Eilutės žymė: išjungtas select į FormData nepatenka. */}
                      <input type="hidden" name={`${prefix}.row`} value="1" />
                      {row.existing ? (
                        <>
                          <input type="hidden" name={`${prefix}.productId`} value={row.productId} />
                          <input type="hidden" name={`${prefix}.variantId`} value={row.variantId} />
                          <span className="strong">{row.productLabel}</span>
                          <span className="muted small">{row.variantLabel}</span>
                        </>
                      ) : (
                        <>
                          <select
                            name={`${prefix}.productId`}
                            value={row.productId}
                            onChange={(e) => selectProduct(row, e.target.value)}
                            aria-label="Produktas"
                          >
                            <option value="">Pasirink produktą…</option>
                            {activeProducts.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                          <select
                            name={`${prefix}.variantId`}
                            value={row.variantId}
                            onChange={(e) => selectVariant(row, e.target.value)}
                            disabled={!product}
                            aria-label="Variantas"
                            aria-invalid={Boolean(errors[`${prefix}.variantId`])}
                          >
                            <option value="">Variantas…</option>
                            {product?.variants.map((v) => (
                              <option
                                key={v.id}
                                value={v.id}
                                disabled={v.id !== row.variantId && usedVariants.has(v.id)}
                              >
                                {v.name}
                              </option>
                            ))}
                          </select>
                        </>
                      )}
                      <FieldError message={errors[`${prefix}.variantId`]} />
                    </td>
                    <td>
                      <input
                        name={`${prefix}.price`}
                        value={row.price}
                        onChange={(e) => updateItem(row.key, { price: e.target.value })}
                        inputMode="decimal"
                        placeholder="12,50"
                        className="input-price"
                        aria-label="Kaina"
                        aria-invalid={Boolean(priceError)}
                      />
                      <FieldError message={priceError} />
                    </td>
                    <td>
                      <input
                        name={`${prefix}.quantityTotal`}
                        value={row.quantityTotal}
                        onChange={(e) => updateItem(row.key, { quantityTotal: e.target.value })}
                        inputMode="numeric"
                        className="input-number"
                        aria-label="Kiekis"
                        aria-invalid={Boolean(errors[`${prefix}.quantityTotal`] ?? belowSold)}
                      />
                      {row.existing ? (
                        <span className="muted small">
                          Parduota: {row.sold}
                          {row.sold > 0 ? ` · min. ${row.sold}` : ''}
                        </span>
                      ) : null}
                      <FieldError message={errors[`${prefix}.quantityTotal`] ?? belowSold} />
                    </td>
                    <td>
                      <input
                        name={`${prefix}.maxPerOrder`}
                        value={row.maxPerOrder}
                        onChange={(e) => updateItem(row.key, { maxPerOrder: e.target.value })}
                        inputMode="numeric"
                        className="input-number"
                        placeholder="—"
                        aria-label="Maks. vienam užsakymui"
                        aria-invalid={Boolean(errors[`${prefix}.maxPerOrder`])}
                      />
                      <FieldError message={errors[`${prefix}.maxPerOrder`]} />
                    </td>
                    <td>
                      <input
                        name={`${prefix}.maxPerCustomer`}
                        value={row.maxPerCustomer}
                        onChange={(e) => updateItem(row.key, { maxPerCustomer: e.target.value })}
                        inputMode="numeric"
                        className="input-number"
                        placeholder="—"
                        aria-label="Maks. vienam pirkėjui"
                        aria-invalid={Boolean(errors[`${prefix}.maxPerCustomer`])}
                      />
                      <FieldError message={errors[`${prefix}.maxPerCustomer`]} />
                    </td>
                    <td className="actions">
                      <button
                        type="button"
                        className="button secondary small"
                        onClick={() => setItems((rows) => rows.filter((r) => r.key !== row.key))}
                        disabled={row.ordersCount > 0 || items.length === 1}
                        title={
                          row.ordersCount > 0
                            ? 'Šią prekę jau užsakė pirkėjai. Vietoj išėmimo nustatyk kiekį lygų parduotam.'
                            : undefined
                        }
                      >
                        Išimti
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <FieldError message={errors.items} />
        {items.some((r) => r.ordersCount > 0) ? (
          <p className="hint">
            Užsakytų prekių išimti negalima: vietoj to nustatyk jų kiekį lygų parduotam.
          </p>
        ) : null}
        <div>
          <button
            type="button"
            className="button secondary small"
            onClick={() => setItems((rows) => [...rows, emptyRow()])}
            disabled={activeProducts.length === 0}
          >
            + Pridėti prekę
          </button>
          {activeProducts.length === 0 ? (
            <span className="hint"> Pirmiau sukurk bent vieną aktyvų produktą.</span>
          ) : null}
        </div>
      </fieldset>

      <div className="form-actions">
        <button type="submit" className="button" disabled={pending}>
          {pending ? 'Saugoma…' : windowId ? 'Išsaugoti' : 'Sukurti juodraštį'}
        </button>
        <Link
          href={windowId ? `/sale-windows/${windowId}` : '/sale-windows'}
          className="button secondary"
        >
          Atšaukti
        </Link>
      </div>
    </form>
  );
}
