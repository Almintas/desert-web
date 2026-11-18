'use client';

import { centsToInput, parseEurToCents, slugify } from '@desert-web/shared';
import Link from 'next/link';
import { type FormEvent, startTransition, useActionState, useId, useRef, useState } from 'react';
import { saveProductAction } from './actions';
import { FIELD, type ProductFormInitial, type ProductFormState } from './form-state';

interface VariantRow {
  /** React key (stabilus net pašalinus eilutę). */
  key: string;
  /** Esamo varianto ID; naujiems tuščias. */
  id: string;
  name: string;
  price: string;
}

interface Props {
  /** null: naujas produktas. */
  productId: string | null;
  initial?: ProductFormInitial;
  categories: string[];
}

const INVALID_PRICE = 'Netinkama kaina (pvz., 12,50)';

function FieldError({ message, id }: { message?: string; id?: string }) {
  return message ? (
    <span className="field-error" id={id}>
      {message}
    </span>
  ) : null;
}

export function ProductForm({ productId, initial, categories }: Props) {
  const action = saveProductAction.bind(null, productId);
  const [state, dispatch, pending] = useActionState<ProductFormState, FormData>(action, {});
  const keySeq = useRef(0);
  const nextKey = () => `row-${keySeq.current++}`;
  const uid = useId();

  const [name, setName] = useState(initial?.name ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  // Kuriant slug sekamas pagal pavadinimą, kol jo neredaguoji ranka. Esamo produkto
  // slug savaime nekeičiamas (pasikeistų viešas adresas).
  const [slugEdited, setSlugEdited] = useState(Boolean(initial));
  const [category, setCategory] = useState(initial?.category ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [allergens, setAllergens] = useState(initial?.allergens.join(', ') ?? '');
  const [variants, setVariants] = useState<VariantRow[]>(() =>
    initial
      ? initial.variants.map((v) => ({
          key: nextKey(),
          id: v.id,
          name: v.name,
          price: centsToInput(v.priceCents),
        }))
      : [{ key: nextKey(), id: '', name: '', price: '' }],
  );
  const [specialEnabled, setSpecialEnabled] = useState(initial?.specialOrder.enabled ?? false);
  const [minQuantity, setMinQuantity] = useState(String(initial?.specialOrder.minQuantity ?? 1));
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);

  const errors = state.fieldErrors ?? {};
  const removedExisting = (initial?.variants ?? []).filter(
    (v) => !variants.some((row) => row.id === v.id),
  );

  function onNameChange(value: string) {
    setName(value);
    if (!slugEdited) setSlug(slugify(value));
  }

  function onSlugChange(value: string) {
    setSlug(value);
    // Ištrynus slug, vėl sekama pagal pavadinimą.
    setSlugEdited(value.trim() !== '');
  }

  function updateVariant(key: string, patch: Partial<VariantRow>) {
    setVariants((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  // Valdomi laukai + rankinis dispatch: React automatiškai neišvalo formos po veiksmo,
  // todėl įvestos reikšmės lieka, jei serveris grąžina klaidą.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  }

  const describedBy = (key: string) => (errors[key] ? `${uid}-${key}` : undefined);

  return (
    <form className="form product-form" onSubmit={onSubmit} noValidate>
      {state.error ? (
        <div className="alert error" role="alert">
          <p>{state.error}</p>
          {state.saleWindows && state.saleWindows.length > 0 ? (
            <ul>
              {state.saleWindows.map((w) => (
                <li key={w.id}>{w.title}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <fieldset>
        <legend>Pagrindinė informacija</legend>
        <label>
          Pavadinimas
          <input
            name={FIELD.name}
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            maxLength={120}
            required
            aria-invalid={Boolean(errors.name)}
            aria-describedby={describedBy('name')}
          />
          <FieldError message={errors.name} id={describedBy('name')} />
        </label>
        <label>
          Adresas (slug)
          <input
            name={FIELD.slug}
            value={slug}
            onChange={(e) => onSlugChange(e.target.value)}
            maxLength={120}
            required
            spellCheck={false}
            aria-invalid={Boolean(errors.slug)}
            aria-describedby={describedBy('slug')}
          />
          <span className="hint">
            {slugEdited
              ? 'Tik mažosios raidės, skaičiai ir brūkšneliai.'
              : 'Sudaromas automatiškai iš pavadinimo.'}
          </span>
          <FieldError message={errors.slug} id={describedBy('slug')} />
        </label>
        <div className="grid-2">
          <label>
            Kategorija
            <input
              name={FIELD.category}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              list={`${uid}-categories`}
              maxLength={60}
              required
              aria-invalid={Boolean(errors.category)}
              aria-describedby={describedBy('category')}
            />
            <datalist id={`${uid}-categories`}>
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <FieldError message={errors.category} id={describedBy('category')} />
          </label>
          <label>
            Alergenai
            <input
              name={FIELD.allergens}
              value={allergens}
              onChange={(e) => setAllergens(e.target.value)}
              placeholder="pienas, kiaušiniai, riešutai"
              aria-invalid={Boolean(errors.allergens)}
              aria-describedby={describedBy('allergens')}
            />
            <span className="hint">Atskirk kableliais.</span>
            <FieldError message={errors.allergens} id={describedBy('allergens')} />
          </label>
        </div>
        <label>
          Aprašymas
          <textarea
            name={FIELD.description}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            maxLength={5000}
            aria-invalid={Boolean(errors.description)}
            aria-describedby={describedBy('description')}
          />
          <FieldError message={errors.description} id={describedBy('description')} />
        </label>
      </fieldset>

      <fieldset>
        <legend>Variantai ir kainos</legend>
        {variants.map((row, i) => {
          const localPriceError =
            row.price.trim() !== '' && parseEurToCents(row.price) === null
              ? INVALID_PRICE
              : undefined;
          const priceError = localPriceError ?? errors[`variants.${i}.priceCents`];
          const rowError = errors[`variants.${i}.id`];
          return (
            <div className="variant-row" key={row.key}>
              <input type="hidden" name={`variants.${i}.id`} value={row.id} />
              <label>
                Pavadinimas
                <input
                  name={`variants.${i}.name`}
                  value={row.name}
                  onChange={(e) => updateVariant(row.key, { name: e.target.value })}
                  placeholder="pvz., 1 kg"
                  maxLength={100}
                  required
                  aria-invalid={Boolean(errors[`variants.${i}.name`])}
                />
                <FieldError message={errors[`variants.${i}.name`]} />
              </label>
              <label>
                Kaina, €
                <input
                  name={`variants.${i}.price`}
                  value={row.price}
                  onChange={(e) => updateVariant(row.key, { price: e.target.value })}
                  inputMode="decimal"
                  placeholder="12,50"
                  required
                  aria-invalid={Boolean(priceError)}
                />
                <FieldError message={priceError} />
              </label>
              <button
                type="button"
                className="button secondary remove"
                onClick={() => setVariants((rows) => rows.filter((r) => r.key !== row.key))}
                disabled={variants.length === 1}
                aria-label={`Pašalinti variantą ${row.name || i + 1}`}
              >
                Pašalinti
              </button>
              {rowError ? <FieldError message={rowError} /> : null}
            </div>
          );
        })}
        <FieldError message={errors.variants} />
        {removedExisting.length > 0 ? (
          <p className="hint">
            Bus pašalinta: {removedExisting.map((v) => v.name).join(', ')}. Pardavimo languose
            naudojamų variantų pašalinti negalima.
          </p>
        ) : null}
        <div>
          <button
            type="button"
            className="button secondary small"
            onClick={() =>
              setVariants((rows) => [...rows, { key: nextKey(), id: '', name: '', price: '' }])
            }
          >
            + Pridėti variantą
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend>Specialūs užsakymai ir būsena</legend>
        <label className="checkbox">
          <input
            type="checkbox"
            name={FIELD.specialOrderEnabled}
            checked={specialEnabled}
            onChange={(e) => setSpecialEnabled(e.target.checked)}
          />
          Galima užsakyti specialiu užsakymu
        </label>
        <label className="narrow">
          Minimalus kiekis
          <input
            name={FIELD.specialOrderMinQuantity}
            value={minQuantity}
            onChange={(e) => setMinQuantity(e.target.value)}
            inputMode="numeric"
            // readOnly, ne disabled: išjungus reikšmė vis tiek siunčiama ir neprarandama.
            readOnly={!specialEnabled}
            aria-invalid={Boolean(errors['specialOrder.minQuantity'])}
          />
          <FieldError message={errors['specialOrder.minQuantity']} />
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            name={FIELD.isActive}
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Aktyvus (rodomas parduotuvėje)
        </label>
        {!isActive ? (
          <p className="hint">
            Archyvuotas produktas parduotuvėje nerodomas, bet lieka sąraše ir užsakymuose.
          </p>
        ) : null}
      </fieldset>

      <div className="form-actions">
        <button type="submit" className="button" disabled={pending}>
          {pending ? 'Saugoma…' : productId ? 'Išsaugoti' : 'Sukurti produktą'}
        </button>
        <Link href="/products" className="button secondary">
          Atšaukti
        </Link>
      </div>
    </form>
  );
}
