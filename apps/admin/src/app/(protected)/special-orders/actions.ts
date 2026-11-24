'use server';

import { redirect } from 'next/navigation';
import { ApiError, apiFetch } from '@/lib/api';
import { requireAdmin } from '@/lib/dal';
import { getSessionToken } from '@/lib/session';
import {
  readConfirmForm,
  SPECIAL_ORDER_COMMANDS,
  type SpecialOrderActionState,
  type SpecialOrderCommand,
} from './form-state';

/**
 * Specialaus užsakymo veiksmas (`command`: confirm, reject, cancel, complete). Ar perėjimas
 * leidžiamas, tikrina API (409 INVALID_STATUS_TRANSITION). Sėkmės atveju nukreipia atgal į
 * užklausą su pranešimu.
 */
export async function specialOrderAction(
  specialOrderId: string,
  _prev: SpecialOrderActionState,
  formData: FormData,
): Promise<SpecialOrderActionState> {
  await requireAdmin();
  const token = await getSessionToken();
  if (!token) redirect('/login');

  const command = String(formData.get('command') ?? '') as SpecialOrderCommand;
  if (!SPECIAL_ORDER_COMMANDS.includes(command)) return { error: 'Nežinomas veiksmas' };

  let body: unknown = {};
  if (command === 'confirm') {
    const { input, fieldErrors } = readConfirmForm(formData);
    if (!input) return { error: 'Patikrink pažymėtus laukus.', fieldErrors };
    body = input;
  } else if (command === 'reject' || command === 'cancel') {
    const reason = String(formData.get('reason') ?? '').trim();
    if (command === 'reject' && !reason) {
      return { fieldErrors: { reason: 'Įvesk priežastį (ją matys pirkėjas)' } };
    }
    body = { reason };
  }

  try {
    await apiFetch(`/admin/special-orders/${encodeURIComponent(specialOrderId)}/${command}`, {
      method: 'POST',
      body,
      token,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect('/auth/clear');
      const fieldErrors: Record<string, string> = {};
      for (const issue of error.issues) fieldErrors[issue.path] ??= issue.message;
      if (Object.keys(fieldErrors).length > 0) {
        return { error: 'Patikrink pažymėtus laukus.', fieldErrors };
      }
      return { error: error.message };
    }
    return { error: 'Nepavyko susisiekti su serveriu. Bandyk vėliau.' };
  }

  redirect(`/special-orders/${specialOrderId}?done=${command}`);
}
