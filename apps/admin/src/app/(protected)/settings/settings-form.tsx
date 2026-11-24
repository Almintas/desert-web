'use client';

import {
  SPECIAL_ORDER_LEAD_TIME_DAYS,
  SPECIAL_ORDER_MAX_DAYS_AHEAD,
  type SpecialOrderSettings,
} from '@desert-web/shared';
import { useActionState, useState } from 'react';
import { saveSettingsAction } from './actions';
import type { SettingsFormState } from './form-state';

function FieldError({ message }: { message?: string }) {
  return message ? <span className="field-error">{message}</span> : null;
}

export function SettingsForm({
  initial,
  canEdit,
}: {
  initial: SpecialOrderSettings;
  canEdit: boolean;
}) {
  const [state, dispatch, pending] = useActionState<SettingsFormState, FormData>(
    saveSettingsAction,
    {},
  );
  // Valdomi laukai: po klaidos įvestos reikšmės lieka.
  const [enabled, setEnabled] = useState(initial.enabled);
  const [leadTimeDays, setLeadTimeDays] = useState(String(initial.leadTimeDays));
  const [maxDaysAhead, setMaxDaysAhead] = useState(String(initial.maxDaysAhead));
  const errors = state.fieldErrors ?? {};
  const disabled = !canEdit || pending;

  return (
    <form action={dispatch} className="form settings-form" noValidate>
      {state.error ? (
        <p className="alert error" role="alert">
          {state.error}
        </p>
      ) : null}
      <fieldset>
        <legend>Specialūs užsakymai</legend>
        <p className="hint">
          Užklausos dideliems kiekiams bet kuriuo metu (ir be atidaryto pardavimo lango). Produktai,
          kuriuos galima užsakyti, ir mažiausias kiekis nustatomi produkto formoje.
        </p>
        <label className="checkbox">
          <input
            type="checkbox"
            name="specialOrders.enabled"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            disabled={disabled}
          />
          Priimti specialius užsakymus
        </label>
        <div className="grid-2">
          <label>
            Mažiausiai dienų iš anksto
            <input
              type="number"
              name="specialOrders.leadTimeDays"
              min={SPECIAL_ORDER_LEAD_TIME_DAYS.min}
              max={SPECIAL_ORDER_LEAD_TIME_DAYS.max}
              step={1}
              value={leadTimeDays}
              onChange={(e) => setLeadTimeDays(e.target.value)}
              aria-invalid={Boolean(errors['specialOrders.leadTimeDays'])}
              disabled={disabled}
            />
            <span className="hint">0: galima užsakyti ir šiandienai.</span>
            <FieldError message={errors['specialOrders.leadTimeDays']} />
          </label>
          <label>
            Daugiausiai dienų į priekį
            <input
              type="number"
              name="specialOrders.maxDaysAhead"
              min={SPECIAL_ORDER_MAX_DAYS_AHEAD.min}
              max={SPECIAL_ORDER_MAX_DAYS_AHEAD.max}
              step={1}
              value={maxDaysAhead}
              onChange={(e) => setMaxDaysAhead(e.target.value)}
              aria-invalid={Boolean(errors['specialOrders.maxDaysAhead'])}
              disabled={disabled}
            />
            <FieldError message={errors['specialOrders.maxDaysAhead']} />
          </label>
        </div>
      </fieldset>
      {canEdit ? (
        <div className="form-actions">
          <button type="submit" className="button" disabled={pending}>
            {pending ? 'Saugoma…' : 'Išsaugoti'}
          </button>
        </div>
      ) : (
        <p className="hint">Nustatymus keisti gali tik savininkas.</p>
      )}
    </form>
  );
}
