'use client';

import { useActionState } from 'react';
import { type LoginState, loginAction } from './actions';

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});

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
      <label>
        Slaptažodis
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
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
