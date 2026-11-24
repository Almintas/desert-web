'use client';

import {
  type AdminSpecialOrderDto,
  canTransitionSpecialOrder,
  centsToInput,
  formatEur,
  isFinalSpecialOrderStatus,
} from '@desert-web/shared';
import { useActionState, useState } from 'react';
import { specialOrderAction } from './actions';
import type { SpecialOrderActionState, SpecialOrderCommand } from './form-state';

function FieldError({ message }: { message?: string }) {
  return message ? <span className="field-error">{message}</span> : null;
}

/**
 * Veiksmai pagal leidžiamus perėjimus (SPECIAL_ORDER_TRANSITIONS): naujai užklausai
 * patvirtinti / atmesti / atšaukti, patvirtintai įvykdyti / atšaukti. Galutinėms nieko.
 */
export function SpecialOrderActions({ specialOrder }: { specialOrder: AdminSpecialOrderDto }) {
  const action = specialOrderAction.bind(null, specialOrder.id);
  const [state, dispatch, pending] = useActionState<SpecialOrderActionState, FormData>(action, {});
  const [selected, setSelected] = useState<SpecialOrderCommand | null>(null);
  // Patvirtinimo forma valdoma, kad po klaidos įvestos reikšmės liktų.
  const [confirmValues, setConfirmValues] = useState({
    totalPrice: centsToInput(specialOrder.estimatedTotalCents),
    adminMessage: '',
    pickupDate: specialOrder.desiredDate,
    pickupFrom: '',
    pickupTo: '',
    pickupLocation: '',
  });
  const [reason, setReason] = useState('');

  const status = specialOrder.status;
  if (isFinalSpecialOrderStatus(status)) return null;
  const can = (to: Parameters<typeof canTransitionSpecialOrder>[1]) =>
    canTransitionSpecialOrder(status, to);
  const errors = state.fieldErrors ?? {};
  const toggle = (c: SpecialOrderCommand) => {
    setSelected(selected === c ? null : c);
    setReason('');
  };
  const setValue = (key: keyof typeof confirmValues) => (value: string) =>
    setConfirmValues((v) => ({ ...v, [key]: value }));

  const cancelButtons = (
    <button
      type="button"
      className="button secondary"
      onClick={() => setSelected(null)}
      disabled={pending}
    >
      Ne
    </button>
  );

  return (
    <section className="panel" aria-label="Veiksmai">
      <div className="panel-actions">
        {can('confirmed') ? (
          <button
            type="button"
            className="button secondary"
            aria-pressed={selected === 'confirm'}
            onClick={() => toggle('confirm')}
            disabled={pending}
          >
            Patvirtinti
          </button>
        ) : null}
        {can('completed') ? (
          <button
            type="button"
            className="button secondary"
            aria-pressed={selected === 'complete'}
            onClick={() => toggle('complete')}
            disabled={pending}
          >
            Pažymėti įvykdyta
          </button>
        ) : null}
        {can('rejected') ? (
          <button
            type="button"
            className="button secondary danger"
            aria-pressed={selected === 'reject'}
            onClick={() => toggle('reject')}
            disabled={pending}
          >
            Atmesti
          </button>
        ) : null}
        {can('cancelled') ? (
          <button
            type="button"
            className="button secondary danger"
            aria-pressed={selected === 'cancel'}
            onClick={() => toggle('cancel')}
            disabled={pending}
          >
            Atšaukti
          </button>
        ) : null}
      </div>

      {selected === 'confirm' ? (
        <form action={dispatch} className="confirm form" noValidate>
          <input type="hidden" name="command" value="confirm" />
          <p>
            <strong>Patvirtinti užklausą {specialOrder.requestNumber}?</strong> Apskaičiuota suma
            pagal bazines kainas: {formatEur(specialOrder.estimatedTotalCents)}. Pirkėjas
            nepatvirtina: nesutikus, užklausą atšauksi.
          </p>
          <label>
            Galutinė suma, €
            <input
              name="totalPrice"
              inputMode="decimal"
              value={confirmValues.totalPrice}
              onChange={(e) => setValue('totalPrice')(e.target.value)}
              aria-invalid={Boolean(errors.totalCents)}
              className="narrow"
              required
            />
            <FieldError message={errors.totalCents} />
          </label>
          <div className="grid-3">
            <label>
              Atsiėmimo diena
              <input
                type="date"
                name="pickupDate"
                value={confirmValues.pickupDate}
                onChange={(e) => setValue('pickupDate')(e.target.value)}
                aria-invalid={Boolean(errors.pickupDate)}
                required
              />
              <FieldError message={errors.pickupDate} />
            </label>
            <label>
              Nuo
              <input
                type="time"
                name="pickupFrom"
                value={confirmValues.pickupFrom}
                onChange={(e) => setValue('pickupFrom')(e.target.value)}
                aria-invalid={Boolean(errors.pickupFrom)}
                required
              />
              <FieldError message={errors.pickupFrom} />
            </label>
            <label>
              Iki
              <input
                type="time"
                name="pickupTo"
                value={confirmValues.pickupTo}
                onChange={(e) => setValue('pickupTo')(e.target.value)}
                aria-invalid={Boolean(errors.pickupTo)}
                required
              />
              <FieldError message={errors.pickupTo} />
            </label>
          </div>
          <label>
            Atsiėmimo vieta
            <input
              name="pickupLocation"
              value={confirmValues.pickupLocation}
              onChange={(e) => setValue('pickupLocation')(e.target.value)}
              aria-invalid={Boolean(errors.pickupLocation)}
              maxLength={300}
              placeholder="Pvz., Gedimino pr. 1, Vilnius"
              required
            />
            <FieldError message={errors.pickupLocation} />
          </label>
          <label>
            Žinutė pirkėjui (neprivaloma)
            <textarea
              name="adminMessage"
              rows={3}
              maxLength={2000}
              value={confirmValues.adminMessage}
              onChange={(e) => setValue('adminMessage')(e.target.value)}
              aria-invalid={Boolean(errors.adminMessage)}
            />
            <FieldError message={errors.adminMessage} />
          </label>
          <p className="hint">Laikas Lietuvos laiku.</p>
          <div className="panel-actions">
            <button type="submit" className="button" disabled={pending}>
              {pending ? 'Vykdoma…' : 'Patvirtinti užklausą'}
            </button>
            {cancelButtons}
          </div>
        </form>
      ) : selected === 'reject' || selected === 'cancel' ? (
        <form action={dispatch} className="confirm danger form" noValidate>
          <input type="hidden" name="command" value={selected} />
          <p>
            <strong>
              {selected === 'reject' ? 'Atmesti' : 'Atšaukti'} užklausą {specialOrder.requestNumber}
              ?
            </strong>{' '}
            To atšaukti negalima.
          </p>
          <label>
            {selected === 'reject' ? 'Priežastis (matys pirkėjas)' : 'Priežastis (neprivaloma)'}
            <textarea
              name="reason"
              rows={2}
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-invalid={Boolean(errors.reason)}
              required={selected === 'reject'}
            />
            <FieldError message={errors.reason} />
          </label>
          <div className="panel-actions">
            <button type="submit" className="button danger-solid" disabled={pending}>
              {pending
                ? 'Vykdoma…'
                : selected === 'reject'
                  ? 'Taip, atmesti užklausą'
                  : 'Taip, atšaukti užklausą'}
            </button>
            {cancelButtons}
          </div>
        </form>
      ) : selected === 'complete' ? (
        <form action={dispatch} className="confirm">
          <input type="hidden" name="command" value="complete" />
          <p>
            <strong>Pažymėti įvykdyta?</strong> Užklausa bus pažymėta apmokėta (
            {specialOrder.confirmation ? formatEur(specialOrder.confirmation.totalCents) : '—'}).
            Grąžinti ankstesnės būsenos nebus galima.
          </p>
          <div className="panel-actions">
            <button type="submit" className="button" disabled={pending}>
              {pending ? 'Vykdoma…' : 'Taip, pažymėti įvykdyta'}
            </button>
            {cancelButtons}
          </div>
        </form>
      ) : null}

      {state.error ? (
        <p className="alert error" role="alert">
          {state.error}
        </p>
      ) : null}
    </section>
  );
}
