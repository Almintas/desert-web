'use server';

import { ORDER_STATUSES, type OrderStatus } from '@desert-web/shared';
import { redirect } from 'next/navigation';
import { ApiError, apiFetch } from '@/lib/api';
import { requireAdmin } from '@/lib/dal';
import { getSessionToken } from '@/lib/session';
import type { OrderActionState } from './form-state';

/**
 * Užsakymo veiksmas: `command` yra nauja būsena (pirmyn) arba "cancel" (su `reason`).
 * Sėkmės atveju nukreipia atgal į užsakymą su pranešimu.
 */
export async function orderAction(
  orderId: string,
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  await requireAdmin();
  const token = await getSessionToken();
  if (!token) redirect('/login');

  const command = String(formData.get('command') ?? '');
  const path = `/admin/orders/${encodeURIComponent(orderId)}`;
  try {
    if (command === 'cancel') {
      const reason = String(formData.get('reason') ?? '').trim();
      await apiFetch(`${path}/cancel`, { method: 'POST', body: { reason }, token });
    } else if ((ORDER_STATUSES as readonly string[]).includes(command)) {
      await apiFetch(`${path}/status`, {
        method: 'POST',
        body: { status: command as OrderStatus },
        token,
      });
    } else {
      return { error: 'Nežinomas veiksmas' };
    }
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect('/auth/clear');
      return { error: error.issues[0]?.message ?? error.message };
    }
    return { error: 'Nepavyko susisiekti su serveriu. Bandyk vėliau.' };
  }

  redirect(`/orders/${orderId}?done=${command}`);
}
