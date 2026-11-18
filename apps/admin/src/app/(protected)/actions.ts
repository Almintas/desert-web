'use server';

import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { deleteSessionCookie, getSessionToken } from '@/lib/session';

export async function logoutAction(): Promise<void> {
  const token = await getSessionToken();
  if (token) {
    // Net jei API nepasiekiamas ar sesija jau negalioja, vietinį cookie vis tiek ištrinam.
    await apiFetch('/admin/auth/logout', { method: 'POST', token }).catch(() => undefined);
  }
  await deleteSessionCookie();
  redirect('/login');
}
