import 'server-only';
import type { AdminOrderDto, AdminOrderListResponse, AdminSaleWindowDto } from '@desert-web/shared';
import { notFound } from 'next/navigation';
import { ApiError, apiFetch } from '@/lib/api';
import { requireAdmin } from '@/lib/dal';
import { getSessionToken } from '@/lib/session';

async function token(): Promise<string | undefined> {
  await requireAdmin();
  return getSessionToken();
}

export async function fetchOrders(params: Record<string, string>): Promise<AdminOrderListResponse> {
  const query = new URLSearchParams(params).toString();
  return apiFetch<AdminOrderListResponse>(`/admin/orders${query ? `?${query}` : ''}`, {
    token: await token(),
  });
}

export async function fetchOrder(id: string): Promise<AdminOrderDto> {
  try {
    return await apiFetch<AdminOrderDto>(`/admin/orders/${encodeURIComponent(id)}`, {
      token: await token(),
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}

export async function fetchWindowsForFilter(): Promise<AdminSaleWindowDto[]> {
  return apiFetch<AdminSaleWindowDto[]>('/admin/sale-windows', { token: await token() });
}
