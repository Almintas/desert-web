'use client';

import { ADMIN_PASSWORD_MIN_LENGTH, ADMIN_ROLES } from '@desert-web/shared';
import { useActionState, useId } from 'react';
import { createAdminAction } from './actions';
import { type CreateAdminState, ROLE_LABELS } from './form-state';

function FieldError({ message, id }: { message?: string; id?: string }) {
  return message ? (
    <span className="field-error" id={id}>
      {message}
    </span>
  ) : null;
}

export function CreateAdminForm() {
  const [state, action, pending] = useActionState<CreateAdminState, FormData>(
    createAdminAction,
    {},
  );
  const uid = useId();
  const errors = state.fieldErrors ?? {};
  const describedBy = (key: string) => (errors[key] ? `${uid}-${key}` : undefined);

  return (
    // key: po kiekvieno pateikimo forma perpiešiama: po sėkmės tuščia, po klaidos su įvestomis
    // reikšmėmis (React 19 po veiksmo formą išvalo, todėl defaultValue turi būti pritaikytas iš naujo).
    <form key={state.attempt ?? 0} action={action} className="form admin-form" noValidate>
      <fieldset>
        <legend>Naujas adminas</legend>
        {state.createdEmail ? (
          <p className="alert success" role="status">
            Adminas {state.createdEmail} sukurtas. Perduok jam slaptažodį saugiu būdu.
          </p>
        ) : null}
        {state.error ? (
          <p className="alert error" role="alert">
            {state.error}
          </p>
        ) : null}

        <div className="grid-2">
          <label>
            El. paštas
            <input
              name="email"
              type="email"
              autoComplete="off"
              required
              defaultValue={state.values?.email}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={describedBy('email')}
            />
            <FieldError message={errors.email} id={describedBy('email')} />
          </label>
          <label>
            Rolė
            <select
              name="role"
              defaultValue={state.values?.role || 'staff'}
              aria-invalid={Boolean(errors.role)}
              aria-describedby={describedBy('role')}
            >
              {ADMIN_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
            <FieldError message={errors.role} id={describedBy('role')} />
          </label>
        </div>
        <p className="hint">
          Darbuotojas tvarko produktus, langus ir užsakymus. Savininkas papildomai gali kurti
          adminus.
        </p>

        <div className="grid-2">
          <label>
            Slaptažodis
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={ADMIN_PASSWORD_MIN_LENGTH}
              required
              aria-invalid={Boolean(errors.password)}
              aria-describedby={describedBy('password')}
            />
            {errors.password ? (
              <FieldError message={errors.password} id={describedBy('password')} />
            ) : (
              <span className="hint">Bent {ADMIN_PASSWORD_MIN_LENGTH} simbolių</span>
            )}
          </label>
          <label>
            Pakartok slaptažodį
            <input
              name="passwordRepeat"
              type="password"
              autoComplete="new-password"
              required
              aria-invalid={Boolean(errors.passwordRepeat)}
              aria-describedby={describedBy('passwordRepeat')}
            />
            <FieldError message={errors.passwordRepeat} id={describedBy('passwordRepeat')} />
          </label>
        </div>

        <div className="form-actions">
          <button type="submit" className="button" disabled={pending}>
            {pending ? 'Kuriama…' : 'Sukurti adminą'}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
