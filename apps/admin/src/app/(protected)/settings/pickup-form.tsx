'use client';

import { PICKUP_INFO_MAX_LENGTHS, type PickupInfo } from '@desert-web/shared';
import { useActionState, useState } from 'react';
import { savePickupAction } from './actions';
import type { SettingsFormState } from './form-state';

function FieldError({ message }: { message?: string }) {
  return message ? <span className="field-error">{message}</span> : null;
}

/**
 * Atsiėmimo vieta ir laikas: bendri visiems pardavimo langams. Valdomi laukai: po klaidos
 * įvestos reikšmės lieka.
 */
export function PickupForm({ initial, canEdit }: { initial: PickupInfo; canEdit: boolean }) {
  const [state, dispatch, pending] = useActionState<SettingsFormState, FormData>(
    savePickupAction,
    {},
  );
  const [location, setLocation] = useState(initial.location);
  const [hours, setHours] = useState(initial.hours);
  const errors = state.fieldErrors ?? {};
  const disabled = !canEdit || pending;

  return (
    <form action={dispatch} className="form settings-form" noValidate id="pickup">
      <h2 className="settings-title">Atsiėmimas</h2>
      <p className="hint">
        Viena vieta ir vienas laikas visiems pardavimo langams. Pirkėjai tai mato pagrindiniame
        puslapyje, užsakymo formoje, užsakymo puslapyje ir laiškuose.
      </p>
      {state.error ? (
        <p className="alert error" role="alert">
          {state.error}
        </p>
      ) : null}
      <fieldset>
        <legend>Atsiėmimo vieta ir laikas</legend>
        <label>
          Atsiėmimo vieta
          <input
            name="pickup.location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={PICKUP_INFO_MAX_LENGTHS.location}
            autoComplete="off"
            disabled={disabled}
            aria-invalid={Boolean(errors['pickup.location'])}
          />
          <FieldError message={errors['pickup.location']} />
        </label>
        <label>
          Atsiėmimo laikas
          <input
            name="pickup.hours"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            maxLength={PICKUP_INFO_MAX_LENGTHS.hours}
            autoComplete="off"
            disabled={disabled}
            aria-invalid={Boolean(errors['pickup.hours'])}
            aria-describedby="pickup-hours-hint"
          />
          <span className="hint" id="pickup-hours-hint">
            Pvz. 17:00–20:00 arba Pirm.–penkt. 17:00–20:00
          </span>
          <FieldError message={errors['pickup.hours']} />
        </label>
      </fieldset>

      {canEdit ? (
        <div className="form-actions">
          <button type="submit" className="button" disabled={pending}>
            {pending ? 'Saugoma…' : 'Išsaugoti atsiėmimą'}
          </button>
        </div>
      ) : (
        <p className="hint">Atsiėmimo informaciją keisti gali tik savininkas.</p>
      )}
    </form>
  );
}
