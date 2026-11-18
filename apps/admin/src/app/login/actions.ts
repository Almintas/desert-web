'use server';

import { type AdminLoginResponse, adminLoginInputSchema } from '@desert-web/shared';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ApiError, apiFetch } from '@/lib/api';
import { setSessionCookie } from '@/lib/session';

export interface LoginState {
  error?: string;
  email?: string;
}

const MISSING_SECRET_MESSAGE =
  'Admin serveris neteisingai sukonfigūruotas: nenustatytas INTERNAL_API_SECRET. ' +
  'Prisijungimas išjungtas, kol administratorius jo nenustatys.';

class MissingInternalSecretError extends Error {}

/**
 * Naršyklės IP API ribojimui (žr. INTERNAL_API_SECRET). Vercel x-forwarded-for nustato pats.
 *
 * Produkcijoje be paslapties neprisijungiam: kitaip API visus prisijungimus skaičiuotų
 * vienam admin serverio IP ir bet kas galėtų užblokuoti visus adminus. Tikrinama čia,
 * pirmo prisijungimo metu, o ne builde (Vercel buildui runtime paslapčių gali neduoti)
 * ir ne instrumentation.ts (serverless aplinkoje „serverio startas“ yra kiekvienas
 * šaltas paleidimas, o ten numesta klaida numuštų visą admin be aiškaus pranešimo).
 */
async function forwardedClientHeaders(): Promise<Record<string, string>> {
  const secret = process.env.INTERNAL_API_SECRET?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error(
        '[admin] INTERNAL_API_SECRET nenustatytas: produkcijoje prisijungimas atmetamas. ' +
          'Nustatyk tą pačią reikšmę kaip API (Railway) admin projekto aplinkoje (Vercel).',
      );
      throw new MissingInternalSecretError(MISSING_SECRET_MESSAGE);
    }
    return {};
  }
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip')?.trim();
  return ip ? { 'X-Internal-Secret': secret, 'X-Client-IP': ip } : {};
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '');
  const parsed = adminLoginInputSchema.safeParse({
    email,
    password: String(formData.get('password') ?? ''),
  });
  if (!parsed.success) {
    return { email, error: parsed.error.issues[0]?.message ?? 'Patikrink įvestus duomenis' };
  }

  let clientHeaders: Record<string, string>;
  try {
    clientHeaders = await forwardedClientHeaders();
  } catch (error) {
    if (error instanceof MissingInternalSecretError) return { email, error: error.message };
    throw error;
  }

  let session: AdminLoginResponse;
  try {
    session = await apiFetch<AdminLoginResponse>('/admin/auth/login', {
      method: 'POST',
      body: parsed.data,
      headers: clientHeaders,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 429) {
        return {
          email,
          error: 'Per daug bandymų prisijungti. Palauk minutę ir bandyk dar kartą.',
        };
      }
      return { email, error: error.message };
    }
    return { email, error: 'Nepavyko susisiekti su serveriu. Bandyk vėliau.' };
  }

  await setSessionCookie(session.token, new Date(session.expiresAt));
  redirect('/');
}
