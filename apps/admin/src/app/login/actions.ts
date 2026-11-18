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

/** Naršyklės IP API ribojimui (žr. INTERNAL_API_SECRET). Vercel x-forwarded-for nustato pats. */
async function forwardedClientHeaders(): Promise<Record<string, string>> {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return {};
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

  let session: AdminLoginResponse;
  try {
    session = await apiFetch<AdminLoginResponse>('/admin/auth/login', {
      method: 'POST',
      body: parsed.data,
      headers: await forwardedClientHeaders(),
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
