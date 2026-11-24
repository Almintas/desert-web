import 'server-only';
import type {
  AdminSpecialOrderDto,
  AdminSpecialOrderListResponse,
  AdminSpecialOrderStatsDto,
} from '@desert-web/shared';
import { notFound } from 'next/navigation';
import { ApiError, apiFetch } from '@/lib/api';
import { requireAdmin } from '@/lib/dal';
import { getSessionToken } from '@/lib/session';

async function token(): Promise<string | undefined> {
  await requireAdmin();
  return getSessionToken();
}

export async function fetchSpecialOrders(
  params: Record<string, string>,
): Promise<AdminSpecialOrderListResponse> {
  const query = new URLSearchParams(params).toString();
  return apiFetch<AdminSpecialOrderListResponse>(
    `/admin/special-orders${query ? `?${query}` : ''}`,
    { token: await token() },
  );
}

export async function fetchSpecialOrder(id: string): Promise<AdminSpecialOrderDto> {
  try {
    return await apiFetch<AdminSpecialOrderDto>(`/admin/special-orders/${encodeURIComponent(id)}`, {
      token: await token(),
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}

/** Navigacijos ženkleliui. Klaida neturi sugadinti viso puslapio: tada ženklelio nėra. */
export async function fetchRequestedCount(): Promise<number | null> {
  try {
    const stats = await apiFetch<AdminSpecialOrderStatsDto>('/admin/special-orders/stats', {
      token: await token(),
    });
    return stats.requested;
  } catch {
    return null;
  }
}
