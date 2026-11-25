'use server';

import {
  type AdminOrderBulkStatusResponse,
  adminOrderBulkStatusInputSchema,
  ORDER_STATUSES,
  type OrderStatus,
} from '@desert-web/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError, apiFetch } from '@/lib/api';
import { requireAdmin } from '@/lib/dal';
import { getSessionToken } from '@/lib/session';
import type { BulkActionState, OrderActionState } from './form-state';

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

/**
 * Masinis „Patvirtinti“ / „Paruošta“ sąraše. Kiekvienas užsakymas API keičiamas atskirai;
 * grąžinama santrauka, o sąrašas perpiešiamas (be redirect, kad santrauka liktų matoma).
 */
export async function bulkStatusAction(
  _prev: BulkActionState,
  formData: FormData,
): Promise<BulkActionState> {
  await requireAdmin();
  const token = await getSessionToken();
  if (!token) redirect('/login');

  const parsed = adminOrderBulkStatusInputSchema.safeParse({
    ids: formData.getAll('ids').map(String),
    status: formData.get('status'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Netinkama užklausa' };

  let response: AdminOrderBulkStatusResponse;
  try {
    response = await apiFetch<AdminOrderBulkStatusResponse>('/admin/orders/bulk-status', {
      method: 'POST',
      body: parsed.data,
      token,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect('/auth/clear');
      return { error: error.issues[0]?.message ?? error.message };
    }
    return { error: 'Nepavyko susisiekti su serveriu. Bandyk vėliau.' };
  }

  revalidatePath('/orders');
  return {
    result: {
      status: parsed.data.status,
      updated: response.summary.updated,
      unchanged: response.summary.unchanged,
      failed: response.results.flatMap((r) =>
        r.outcome === 'error'
          ? [{ orderNumber: r.orderNumber, status: r.status, message: r.message }]
          : [],
      ),
    },
  };
}
