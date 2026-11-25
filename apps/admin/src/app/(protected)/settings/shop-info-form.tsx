'use client';

import {
  SELLER_FIELD_LABELS,
  SHOP_INFO_MAX_LENGTHS,
  type ShopInfo,
  SOCIAL_DOMAINS,
  SOCIAL_LABELS,
  SOCIAL_NETWORKS,
} from '@desert-web/shared';
import { useActionState, useState } from 'react';
import { saveShopInfoAction } from './actions';
import type { SettingsFormState } from './form-state';

function FieldError({ message }: { message?: string }) {
  return message ? <span className="field-error">{message}</span> : null;
}

const EMPTY_HINT = 'Paliekama tuščia – nerodoma.';

interface FieldProps {
  name: string;
  label: string;
  value: string;
  onChange: (name: string, value: string) => void;
  maxLength: number;
  hint?: string;
  type?: 'text' | 'email' | 'tel' | 'url';
  placeholder?: string;
  multiline?: boolean;
  errors: Record<string, string>;
  disabled: boolean;
}

function Field({
  name,
  label,
  value,
  onChange,
  maxLength,
  hint = EMPTY_HINT,
  type = 'text',
  placeholder,
  multiline,
  errors,
  disabled,
}: FieldProps) {
  const error = errors[name];
  const common = {
    name,
    value,
    onChange: (e: { target: { value: string } }) => onChange(name, e.target.value),
    maxLength,
    placeholder,
    disabled,
    'aria-invalid': Boolean(error),
  };
  return (
    <label>
      {label}
      {multiline ? (
        <textarea rows={2} {...common} />
      ) : (
        <input
          type={type}
          inputMode={type === 'tel' ? 'tel' : undefined}
          autoComplete="off"
          {...common}
        />
      )}
      {hint ? <span className="hint">{hint}</span> : null}
      <FieldError message={error} />
    </label>
  );
}

/** Formos reikšmės pagal lauko vardą („shop.seller.name“ ir t. t.). */
function flatten(info: ShopInfo): Record<string, string> {
  return Object.fromEntries(
    Object.entries(info).flatMap(([group, fields]) =>
      Object.entries(fields as Record<string, string>).map(([k, v]) => [`shop.${group}.${k}`, v]),
    ),
  );
}

/**
 * Parduotuvės informacija: pardavėjo duomenys, socialiniai tinklai ir pagrindinio puslapio
 * tekstai. Valdomi laukai: po klaidos įvestos reikšmės lieka (React formą po veiksmo išvalytų).
 */
export function ShopInfoForm({ initial, canEdit }: { initial: ShopInfo; canEdit: boolean }) {
  const [state, dispatch, pending] = useActionState<SettingsFormState, FormData>(
    saveShopInfoAction,
    {},
  );
  const [values, setValues] = useState(() => flatten(initial));
  const errors = state.fieldErrors ?? {};
  const disabled = !canEdit || pending;
  const onChange = (name: string, value: string) => setValues((v) => ({ ...v, [name]: value }));
  const field = (name: string) => ({ name, value: values[name] ?? '', onChange, errors, disabled });
  const L = SHOP_INFO_MAX_LENGTHS;

  return (
    <form action={dispatch} className="form settings-form" noValidate id="shop">
      <h2 className="settings-title">Parduotuvės informacija</h2>
      <p className="hint">
        Rodoma svetainės poraštėje, privatumo puslapyje, užsakymo formoje ir laiškuose pirkėjams.
        Pakeitimai svetainėje atsiranda maždaug per minutę.
      </p>
      {state.error ? (
        <p className="alert error" role="alert">
          {state.error}
        </p>
      ) : null}

      <fieldset>
        <legend>Pardavėjas</legend>
        <Field
          {...field('shop.seller.name')}
          label="Vardas, pavardė arba įmonės pavadinimas"
          maxLength={L.name}
          hint="Paliekama tuščia – rodomas parduotuvės pavadinimas."
        />
        <Field
          {...field('shop.seller.businessId')}
          label={SELLER_FIELD_LABELS.businessId}
          maxLength={L.businessId}
          hint="Tik numeris, be „IV pažymos Nr.“. Paliekama tuščia – nerodoma."
        />
        <Field
          {...field('shop.seller.address')}
          label={SELLER_FIELD_LABELS.address}
          maxLength={L.address}
        />
        <div className="grid-2">
          <Field
            {...field('shop.seller.email')}
            label={SELLER_FIELD_LABELS.email}
            type="email"
            maxLength={L.email}
            hint="Į šį adresą nueina pirkėjų atsakymai į laiškus. Paliekama tuščia – nerodoma."
          />
          <Field
            {...field('shop.seller.phone')}
            label={SELLER_FIELD_LABELS.phone}
            type="tel"
            placeholder="+370 600 12345"
            maxLength={L.phone}
          />
        </div>
      </fieldset>

      <fieldset>
        <legend>Soc. tinklai</legend>
        <p className="hint">
          Profilio adresas, pvz., https://www.facebook.com/parduotuve. {EMPTY_HINT}
        </p>
        {SOCIAL_NETWORKS.map((network) => (
          <Field
            key={network}
            {...field(`shop.social.${network}`)}
            label={SOCIAL_LABELS[network]}
            type="url"
            placeholder={`https://www.${SOCIAL_DOMAINS[network]}/…`}
            maxLength={L.url}
            hint=""
          />
        ))}
      </fieldset>

      <fieldset>
        <legend>Pagrindinio puslapio tekstai</legend>
        <Field
          {...field('shop.texts.tagline')}
          label="Šūkis (didžioji antraštė)"
          maxLength={L.tagline}
          hint="Paliekama tuščia – rodomas parduotuvės pavadinimas."
          multiline
        />
        <Field
          {...field('shop.texts.subtagline')}
          label="Antra eilutė po šūkiu"
          maxLength={L.subtagline}
          multiline
        />
      </fieldset>

      {canEdit ? (
        <div className="form-actions">
          <button type="submit" className="button" disabled={pending}>
            {pending ? 'Saugoma…' : 'Išsaugoti parduotuvės informaciją'}
          </button>
        </div>
      ) : (
        <p className="hint">Parduotuvės informaciją keisti gali tik savininkas.</p>
      )}
    </form>
  );
}
