'use client';

import { useActionState, useId, useState } from 'react';
import { type LoginState, loginAction } from './actions';

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  const [showPassword, setShowPassword] = useState(false);
  const passwordId = useId();

  return (
    <form action={action} className="form">
      <label>
        El. paštas
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={state.email}
        />
      </label>
      {/* Atskiras label (ne apgaubiantis): mygtuko tekstas nepatenka į lauko pavadinimą. */}
      <div className="field">
        <label htmlFor={passwordId}>Slaptažodis</label>
        <span className="password-field">
          <input
            id={passwordId}
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
          />
          <button
            type="button"
            className="password-toggle"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Slėpti slaptažodį' : 'Rodyti slaptažodį'}
            aria-pressed={showPassword}
            aria-controls={passwordId}
            title={showPassword ? 'Slėpti slaptažodį' : 'Rodyti slaptažodį'}
          >
            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </span>
      </div>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="button" disabled={pending}>
        {pending ? 'Jungiamasi…' : 'Prisijungti'}
      </button>
    </form>
  );
}

function EyeIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.8 3.8" />
      <path d="M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m2 2 20 20" />
    </svg>
  );
}
