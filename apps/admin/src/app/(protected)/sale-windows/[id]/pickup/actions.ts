'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError, apiFetch } from '@/lib/api';
import { requireAdmin } from '@/lib/dal';
import { getSessionToken } from '@/lib/session';

export interface PickupActionState {
  error?: string;
}

/**
 * „Atsiėmė ir sumokėjo“: užsakymas -> completed (API tame pačiame įraše pažymi apmokėjimą).
 * Be redirect: sąrašas perpiešiamas (revalidatePath), o paieškos laukas lieka koks buvo.
 */
export async function completePickupAction(
  orderId: string,
  windowId: string,
  _prev: PickupActionState,
  _formData: FormData,
): Promise<PickupActionState> {
  await requireAdmin();
  const token = await getSessionToken();
  if (!token) redirect('/login');

  try {
    await apiFetch(`/admin/orders/${encodeURIComponent(orderId)}/status`, {
      method: 'POST',
      body: { status: 'completed' },
      token,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect('/auth/clear');
      return { error: error.issues[0]?.message ?? error.message };
    }
    return { error: 'Nepavyko susisiekti su serveriu. Bandyk dar kartą.' };
  }

  revalidatePath(`/sale-windows/${windowId}/pickup`);
  return {};
}
