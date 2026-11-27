'use server';

import {
  adminSettingsInputSchema,
  pickupInfoInputSchema,
  shopInfoInputSchema,
} from '@desert-web/shared';
import { redirect } from 'next/navigation';
import { ApiError, apiFetch } from '@/lib/api';
import { requireAdmin } from '@/lib/dal';
import { getSessionToken } from '@/lib/session';
import type { SettingsFormState } from './form-state';

function integer(formData: FormData, key: string): number {
  const raw = String(formData.get(key) ?? '').trim();
  return /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
}

/** Specialių užsakymų nustatymai. Keisti gali tik owner (API dar kartą tikrina: 403). */
export async function saveSettingsAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const admin = await requireAdmin();
  if (admin.role !== 'owner') return { error: 'Nustatymus keisti gali tik savininkas.' };
  const token = await getSessionToken();
  if (!token) redirect('/login');

  const parsed = adminSettingsInputSchema.safeParse({
    specialOrders: {
      enabled: formData.get('specialOrders.enabled') === 'on',
      leadTimeDays: integer(formData, 'specialOrders.leadTimeDays'),
      maxDaysAhead: integer(formData, 'specialOrders.maxDaysAhead'),
    },
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.map(String).join('.')] ??= issue.message;
    }
    return { error: 'Patikrink pažymėtus laukus.', fieldErrors };
  }

  try {
    await apiFetch('/admin/settings', { method: 'PUT', body: parsed.data, token });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect('/auth/clear');
      const fieldErrors: Record<string, string> = {};
      for (const issue of error.issues) fieldErrors[issue.path] ??= issue.message;
      return Object.keys(fieldErrors).length > 0
        ? { error: 'Patikrink pažymėtus laukus.', fieldErrors }
        : { error: error.message };
    }
    return { error: 'Nepavyko susisiekti su serveriu. Bandyk vėliau.' };
  }

  redirect('/settings?done=saved');
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

/** Parduotuvės informacija (pardavėjas, soc. tinklai, tekstai). Tik owner (API tikrina: 403). */
export async function saveShopInfoAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const admin = await requireAdmin();
  if (admin.role !== 'owner') return { error: 'Nustatymus keisti gali tik savininkas.' };
  const token = await getSessionToken();
  if (!token) redirect('/login');

  const parsed = shopInfoInputSchema.safeParse({
    seller: {
      name: text(formData, 'shop.seller.name'),
      businessId: text(formData, 'shop.seller.businessId'),
      address: text(formData, 'shop.seller.address'),
      email: text(formData, 'shop.seller.email'),
      phone: text(formData, 'shop.seller.phone'),
    },
    social: {
      facebook: text(formData, 'shop.social.facebook'),
      instagram: text(formData, 'shop.social.instagram'),
      tiktok: text(formData, 'shop.social.tiktok'),
    },
    texts: {
      tagline: text(formData, 'shop.texts.tagline'),
      subtagline: text(formData, 'shop.texts.subtagline'),
    },
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[['shop', ...issue.path.map(String)].join('.')] ??= issue.message;
    }
    return { error: 'Patikrink pažymėtus laukus.', fieldErrors };
  }

  try {
    await apiFetch('/admin/settings', { method: 'PUT', body: { shop: parsed.data }, token });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect('/auth/clear');
      const fieldErrors: Record<string, string> = {};
      for (const issue of error.issues) fieldErrors[issue.path] ??= issue.message;
      return Object.keys(fieldErrors).length > 0
        ? { error: 'Patikrink pažymėtus laukus.', fieldErrors }
        : { error: error.message };
    }
    return { error: 'Nepavyko susisiekti su serveriu. Bandyk vėliau.' };
  }

  redirect('/settings?done=shop#shop');
}

/** Atsiėmimo vieta ir laikas (bendri visiems langams). Tik owner (API tikrina: 403). */
export async function savePickupAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const admin = await requireAdmin();
  if (admin.role !== 'owner') return { error: 'Nustatymus keisti gali tik savininkas.' };
  const token = await getSessionToken();
  if (!token) redirect('/login');

  const parsed = pickupInfoInputSchema.safeParse({
    location: text(formData, 'pickup.location'),
    hours: text(formData, 'pickup.hours'),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[['pickup', ...issue.path.map(String)].join('.')] ??= issue.message;
    }
    return { error: 'Patikrink pažymėtus laukus.', fieldErrors };
  }

  try {
    await apiFetch('/admin/settings', { method: 'PUT', body: { pickup: parsed.data }, token });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect('/auth/clear');
      const fieldErrors: Record<string, string> = {};
      for (const issue of error.issues) fieldErrors[issue.path] ??= issue.message;
      return Object.keys(fieldErrors).length > 0
        ? { error: 'Patikrink pažymėtus laukus.', fieldErrors }
        : { error: error.message };
    }
    return { error: 'Nepavyko susisiekti su serveriu. Bandyk vėliau.' };
  }

  redirect('/settings?done=pickup#pickup');
}
