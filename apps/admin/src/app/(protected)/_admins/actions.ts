'use server';

import { type AdminDto, adminCreateInputSchema } from '@desert-web/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError, apiFetch } from '@/lib/api';
import { requireAdmin } from '@/lib/dal';
import { getSessionToken } from '@/lib/session';
import type { CreateAdminState } from './form-state';

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

/** Owner sukuria naują adminą. Teises dar kartą tikrina API (403 ne owner rolei). */
export async function createAdminAction(
  prev: CreateAdminState,
  formData: FormData,
): Promise<CreateAdminState> {
  const state = await createAdmin(formData);
  return { ...state, attempt: (prev.attempt ?? 0) + 1 };
}

async function createAdmin(formData: FormData): Promise<CreateAdminState> {
  const admin = await requireAdmin();
  if (admin.role !== 'owner') return { error: 'Adminus gali kurti tik savininkas.' };
  const token = await getSessionToken();
  if (!token) redirect('/login');

  const values = { email: text(formData, 'email'), role: text(formData, 'role') };
  const password = text(formData, 'password');
  const fieldErrors: Record<string, string> = {};

  const parsed = adminCreateInputSchema.safeParse({ ...values, password });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.map(String).join('.')] ??= issue.message;
    }
  }
  if (password !== text(formData, 'passwordRepeat')) {
    fieldErrors.passwordRepeat = 'Slaptažodžiai nesutampa';
  }
  if (!parsed.success || Object.keys(fieldErrors).length > 0) {
    return { error: 'Patikrink pažymėtus laukus.', fieldErrors, values };
  }

  let created: AdminDto;
  try {
    created = await apiFetch<AdminDto>('/admin/admins', {
      method: 'POST',
      body: parsed.data,
      token,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect('/auth/clear');
      if (error.code === 'ADMIN_EMAIL_TAKEN') {
        return { fieldErrors: { email: error.message }, values };
      }
      const apiFieldErrors: Record<string, string> = {};
      for (const issue of error.issues) apiFieldErrors[issue.path] ??= issue.message;
      if (Object.keys(apiFieldErrors).length > 0) {
        return { error: 'Patikrink pažymėtus laukus.', fieldErrors: apiFieldErrors, values };
      }
      return { error: error.message, values };
    }
    return { error: 'Nepavyko susisiekti su serveriu. Bandyk vėliau.', values };
  }

  revalidatePath('/');
  return { createdEmail: created.email };
}
