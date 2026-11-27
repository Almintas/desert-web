'use client';

import {
  type AdminSaleWindowDto,
  centsToInput,
  formatEur,
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
  /** Galima supakuoti kaip dovaną (rodoma tik kai pakavimas lange įjungtas). */
  giftWrapAllowed: boolean;
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
  const [giftWrapEnabled, setGiftWrapEnabled] = useState(initial?.giftWrap.enabled ?? false);
  const [giftWrapPrice, setGiftWrapPrice] = useState(
    initial && initial.giftWrap.priceCents > 0 ? centsToInput(initial.giftWrap.priceCents) : '',
  );

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
    giftWrapAllowed: true,
    sold: 0,
    ordersCount: 0,
  });
  // eslint-disable-next-line react-hooks/refs -- eilučių raktų skaitiklis; lazy initializer vykdomas tik pirmo render metu
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
          giftWrapAllowed: i.giftWrapAllowed,
          sold: i.sold,
          ordersCount: i.ordersCount,
        }))
      : [emptyRow()],
  );

  // Serverio klaidos galioja iki kito išsaugojimo, bet pakeistos eilutės klaida paslepiama
  // (kitaip, pvz., „Ši prekė lange jau yra“ liktų ir pasirinkus kitą produktą).
  const [errorsState, setErrorsState] = useState(state);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  if (errorsState !== state) {
    setErrorsState(state);
    setDismissed(new Set());
  }
  const errors = Object.fromEntries(
    Object.entries(state.fieldErrors ?? {}).filter(([k]) => !dismissed.has(k)),
  );
  const dismiss = (...keys: string[]) => setDismissed((prev) => new Set([...prev, ...keys]));

  const usedVariants = new Set(items.map((i) => i.variantId).filter(Boolean));
  /** Varianto jau yra kitoje eilutėje. */
  const usedElsewhere = (row: ItemRow, variantId: string) =>
    variantId !== row.variantId && usedVariants.has(variantId);

  function updateItem(key: string, patch: Partial<ItemRow>) {
    setItems((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function selectProduct(row: ItemRow, index: number, productId: string) {
    const product = activeProducts.find((p) => p.id === productId);
    // Vienintelis dar nepanaudotas variantas pasirenkamas iškart.
    const free = product?.variants.filter((v) => !usedElsewhere(row, v.id)) ?? [];
    const only = free.length === 1 ? free[0] : undefined;
    updateItem(row.key, {
      productId,
      variantId: only?.id ?? '',
      price: only ? centsToInput(only.priceCents) : row.price,
    });
    dismiss(`items.${index}.variantId`, `items.${index}.priceCents`);
  }

  function selectVariant(row: ItemRow, index: number, variantId: string) {
    const variant = activeProducts
      .find((p) => p.id === row.productId)
      ?.variants.find((v) => v.id === variantId);
    // Kaina užpildoma bazine varianto kaina; ją galima pakeisti.
    updateItem(row.key, {
      variantId,
      price: variant ? centsToInput(variant.priceCents) : row.price,
    });
    dismiss(`items.${index}.variantId`, `items.${index}.priceCents`);
  }

  function removeItem(key: string) {
    setItems((rows) => rows.filter((r) => r.key !== key));
    // Eilučių klaidos surištos su indeksu, kuris po išėmimo pasislenka.
    dismiss(...Object.keys(state.fieldErrors ?? {}).filter((k) => k.startsWith('items.')));
  }

  // Valdomi laukai + rankinis dispatch: React neišvalo formos, todėl po klaidos įvestis lieka.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  }

  const giftWrapPriceError =
    giftWrapEnabled && giftWrapPrice.trim() !== '' && parseEurToCents(giftWrapPrice) === null
      ? 'Netinkama kaina (pvz., 2,00)'
      : errors['giftWrap.priceCents'];
  const giftWrapPriceCents = parseEurToCents(giftWrapPrice);

  return (
    <form className="form window-form" onSubmit={onSubmit} noValidate>
      {state.error ? (
        <div className="alert error" role="alert">
          <p>{state.error}</p>
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
      {/* Kol kas tik atsiėmimas (vieta ir laikas nustatymuose): pristatymas lieka duomenų
          modelyje, bet išjungtas. */}
      <FieldError message={errors.fulfillment} />

      <fieldset>
        <legend>Dovanų pakavimas</legend>
        <label className="checkbox">
          <input
            type="checkbox"
            name="giftWrap.enabled"
            checked={giftWrapEnabled}
            onChange={(e) => {
              setGiftWrapEnabled(e.target.checked);
              dismiss('giftWrap.priceCents');
            }}
          />
          Leisti supakuoti kaip dovaną
        </label>
        {giftWrapEnabled ? (
          <>
            <label className="narrow">
              Kaina už vienetą, €
              <input
                name="giftWrap.price"
                value={giftWrapPrice}
                onChange={(e) => {
                  setGiftWrapPrice(e.target.value);
                  dismiss('giftWrap.priceCents');
                }}
                inputMode="decimal"
                placeholder="2,00"
                aria-invalid={Boolean(giftWrapPriceError)}
                aria-describedby="gift-wrap-hint"
              />
              <FieldError message={giftWrapPriceError} />
            </label>
            <p className="hint" id="gift-wrap-hint">
              {giftWrapPriceCents && giftWrapPriceCents > 0
                ? `Pirkėjas mokės ${formatEur(giftWrapPriceCents)} už kiekvieną supakuotą vienetą. `
                : 'Pirkėjas mokės šią sumą už kiekvieną supakuotą vienetą. '}
              Kurias prekes galima pakuoti, pažymėk prekių lentelėje. Pakeitimai galioja tik
              naujiems užsakymams.
            </p>
          </>
        ) : (
          // Išjungus kaina neprarandama: išsaugoma, kad įjungus vėl nereikėtų įvesti.
          <input type="hidden" name="giftWrap.price" value={giftWrapPrice} />
        )}
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
                {giftWrapEnabled ? <th scope="col">Dovana</th> : null}
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
                      <input
                        type="hidden"
                        name={`${prefix}.giftWrapAllowed`}
                        value={row.giftWrapAllowed ? '1' : '0'}
                      />
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
                            onChange={(e) => selectProduct(row, i, e.target.value)}
                            aria-label="Produktas"
                          >
                            <option value="">Pasirink produktą…</option>
                            {activeProducts.map((p) => {
                              const full =
                                p.id !== row.productId &&
                                p.variants.every((v) => usedElsewhere(row, v.id));
                              return (
                                <option key={p.id} value={p.id} disabled={full}>
                                  {full ? `${p.name} (jau lange)` : p.name}
                                </option>
                              );
                            })}
                          </select>
                          <select
                            name={`${prefix}.variantId`}
                            value={row.variantId}
                            onChange={(e) => selectVariant(row, i, e.target.value)}
                            disabled={!product}
                            aria-label="Variantas"
                            aria-invalid={Boolean(errors[`${prefix}.variantId`])}
                          >
                            <option value="">Variantas…</option>
                            {product?.variants.map((v) => (
                              <option key={v.id} value={v.id} disabled={usedElsewhere(row, v.id)}>
                                {usedElsewhere(row, v.id) ? `${v.name} (jau lange)` : v.name}
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
                    {giftWrapEnabled ? (
                      <td>
                        <label className="checkbox gift-wrap-allowed">
                          <input
                            type="checkbox"
                            checked={row.giftWrapAllowed}
                            onChange={(e) =>
                              updateItem(row.key, { giftWrapAllowed: e.target.checked })
                            }
                          />
                          Galima supakuoti kaip dovaną
                        </label>
                      </td>
                    ) : null}
                    <td className="actions">
                      <button
                        type="button"
                        className="button secondary small"
                        onClick={() => removeItem(row.key)}
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
