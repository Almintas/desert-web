'use client';

import {
  centsToInput,
  PRODUCT_IMAGE_ACCEPT,
  PRODUCT_IMAGE_MAX_COUNT,
  parseEurToCents,
} from '@desert-web/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  type ChangeEvent,
  type FormEvent,
  startTransition,
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { saveProductAction } from './actions';
import { FIELD, type ProductFormInitial, type ProductFormState } from './form-state';
import { attachImageAction, getUploadSignatureAction } from './image-actions';
import { imageFileError, MAX_MB, UploadError, uploadToCloudinary } from './image-upload';

interface VariantRow {
  /** React key (stabilus net pašalinus eilutę). */
  key: string;
  /** Esamo varianto ID; naujiems tuščias. */
  id: string;
  name: string;
  price: string;
}

/** Naujam produktui pasirinkta, bet dar neįkelta nuotrauka. */
interface PendingImage {
  key: string;
  file: File;
  /** blob: URL peržiūrai (HEIC naršyklės dažnai neparodo, tada rodomas tik pavadinimas). */
  previewUrl: string;
}

/** Nuotraukų įkėlimas sukūrus produktą. */
interface UploadPhase {
  /** Kelinta nuotrauka keliama (nuo 1). */
  current: number;
  total: number;
  percent: number;
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
  const router = useRouter();
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(initial?.name ?? '');
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
  const [images, setImages] = useState<PendingImage[]>([]);
  const [imageErrors, setImageErrors] = useState<string[]>([]);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase | null>(null);
  const uploadStarted = useRef<string | null>(null);

  const errors = state.fieldErrors ?? {};
  const removedExisting = (initial?.variants ?? []).filter(
    (v) => !variants.some((row) => row.id === v.id),
  );
  const busy = pending || uploadPhase !== null || Boolean(state.createdId);

  // blob: URL'ai atlaisvinami, kai komponentas dingsta (pašalinus nuotrauką, iškart).
  const imagesRef = useRef(images);
  imagesRef.current = images;
  useEffect(
    () => () => {
      for (const img of imagesRef.current) URL.revokeObjectURL(img.previewUrl);
    },
    [],
  );

  function onImagesSelected(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = ''; // tą patį failą vėl galima pasirinkti
    const errorsNow: string[] = [];
    const added: PendingImage[] = [];
    let slots = PRODUCT_IMAGE_MAX_COUNT - images.length;
    for (const file of files) {
      const fileError = imageFileError(file);
      if (fileError) {
        errorsNow.push(`${file.name}: ${fileError}`);
      } else if (slots <= 0) {
        errorsNow.push(`${file.name}: daugiausia ${PRODUCT_IMAGE_MAX_COUNT} nuotraukos produktui.`);
      } else {
        slots -= 1;
        added.push({
          key: nextKey(),
          file,
          previewUrl: URL.createObjectURL(file),
        });
      }
    }
    setImageErrors(errorsNow);
    if (added.length > 0) setImages((list) => [...list, ...added]);
  }

  function removeImage(key: string) {
    const img = images.find((i) => i.key === key);
    if (img) URL.revokeObjectURL(img.previewUrl);
    setImages((list) => list.filter((i) => i.key !== key));
  }

  function moveImage(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= images.length) return;
    setImages((list) => {
      const next = [...list];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  // Produktas sukurtas: įkeliam pasirinktas nuotraukas po vieną ir einam į jo puslapį.
  // Vieno failo klaida kitų nesustabdo; nepavykusias galima pridėti produkto puslapyje.
  useEffect(() => {
    const createdId = state.createdId;
    if (!createdId || uploadStarted.current === createdId) return;
    uploadStarted.current = createdId;
    const queue = imagesRef.current.map((i) => i.file);

    void (async () => {
      let uploaded = 0;
      try {
        const signed = await getUploadSignatureAction();
        if (signed.ok) {
          for (const [i, file] of queue.entries()) {
            setUploadPhase({ current: i + 1, total: queue.length, percent: 0 });
            try {
              const upload = await uploadToCloudinary(file, signed.signature, (percent) =>
                setUploadPhase({ current: i + 1, total: queue.length, percent }),
              );
              const result = await attachImageAction(createdId, upload);
              if (result.ok) uploaded += 1;
            } catch (e) {
              if (!(e instanceof UploadError)) throw e;
            }
          }
        }
      } catch {
        // Ryšio su serveriu klaida: likusios nuotraukos lieka neįkeltos.
      }
      const failed = queue.length - uploaded;
      const query = failed > 0 ? `created=1&imageErrors=${failed}` : 'created=1';
      router.push(`/products/${encodeURIComponent(createdId)}?${query}`);
    })();
  }, [state.createdId, router]);

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
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            required
            aria-invalid={Boolean(errors.name)}
            aria-describedby={describedBy('name')}
          />
          <FieldError message={errors.name} id={describedBy('name')} />
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

      {productId === null ? (
        <fieldset>
          <legend>Nuotraukos</legend>
          <input type="hidden" name={FIELD.withImages} value={images.length > 0 ? '1' : ''} />
          {images.length === 0 ? (
            <p className="hint">Nuotraukų dar nėra. Pirmoji nuotrauka bus pagrindinė.</p>
          ) : (
            <ol className="image-grid">
              {images.map((img, index) => (
                <li key={img.key} className="image-tile">
                  <div className="image-frame">
                    <img
                      src={img.previewUrl}
                      alt={`Nuotrauka ${index + 1}: ${img.file.name}`}
                      width={160}
                      height={160}
                    />
                    {index === 0 ? <span className="badge main-image">Pagrindinė</span> : null}
                  </div>
                  <span className="muted small image-name">{img.file.name}</span>
                  <div className="image-actions">
                    <button
                      type="button"
                      className="button secondary small"
                      onClick={() => moveImage(index, -1)}
                      disabled={busy || index === 0}
                      aria-label={`Perkelti nuotrauką ${index + 1} anksčiau`}
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      className="button secondary small"
                      onClick={() => moveImage(index, 1)}
                      disabled={busy || index === images.length - 1}
                      aria-label={`Perkelti nuotrauką ${index + 1} vėliau`}
                    >
                      →
                    </button>
                    <button
                      type="button"
                      className="button secondary danger small"
                      onClick={() => removeImage(img.key)}
                      disabled={busy}
                      aria-label={`Pašalinti nuotrauką ${index + 1}`}
                    >
                      Pašalinti
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {imageErrors.length > 0 ? (
            <ul className="field-error-list" role="alert">
              {imageErrors.map((message) => (
                <li key={message} className="field-error">
                  {message}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="upload-row">
            <input
              ref={imageInputRef}
              type="file"
              multiple
              accept={PRODUCT_IMAGE_ACCEPT}
              onChange={onImagesSelected}
              disabled={busy || images.length >= PRODUCT_IMAGE_MAX_COUNT}
              className="visually-hidden"
              tabIndex={-1}
              aria-hidden="true"
            />
            <button
              type="button"
              className="button secondary"
              onClick={() => imageInputRef.current?.click()}
              disabled={busy || images.length >= PRODUCT_IMAGE_MAX_COUNT}
            >
              Pridėti nuotraukų
            </button>
            <span className="hint">
              {images.length < PRODUCT_IMAGE_MAX_COUNT
                ? `JPG, PNG, WEBP arba HEIC, iki ${MAX_MB} MB. Įkeliamos sukūrus produktą.`
                : `Pasiektas ${PRODUCT_IMAGE_MAX_COUNT} nuotraukų limitas.`}
            </span>
          </div>
        </fieldset>
      ) : null}

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
                Kiekis / svoris
                <input
                  name={`variants.${i}.name`}
                  value={row.name}
                  onChange={(e) => updateVariant(row.key, { name: e.target.value })}
                  placeholder="pvz., 6 vnt. arba 1 kg"
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
        <button type="submit" className="button" disabled={busy}>
          {uploadPhase
            ? `Įkeliama nuotrauka ${uploadPhase.current} iš ${uploadPhase.total}… ${uploadPhase.percent}%`
            : busy
              ? 'Saugoma…'
              : productId
                ? 'Išsaugoti'
                : 'Sukurti produktą'}
        </button>
        <Link href="/products" className="button secondary">
          Atšaukti
        </Link>
      </div>
    </form>
  );
}
