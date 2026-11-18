import 'server-only';
import type { AdminDto } from '@desert-web/shared';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { ApiError, apiFetch } from './api';
import { getSessionToken } from './session';

/**
 * Tikrasis autorizacijos patikrinimas: klausia API, ar sesija galioja.
 * Naudoti kiekviename apsaugotame layout / puslapyje / Server Action.
 * cache() užtikrina vieną kreipinį į API per užklausą.
 */
export const requireAdmin = cache(async (): Promise<AdminDto> => {
  const token = await getSessionToken();
  if (!token) redirect('/login');

  try {
    return await apiFetch<AdminDto>('/admin/auth/me', { token });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      // Server Component cookie ištrinti negali, todėl tai daro Route Handler.
      redirect('/auth/clear');
    }
    throw error;
  }
});
