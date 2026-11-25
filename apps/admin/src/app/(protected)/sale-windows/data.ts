import 'server-only';
import type { AdminPickupOrderDto, AdminProductDto, AdminSaleWindowDto } from '@desert-web/shared';
import { notFound } from 'next/navigation';
import { ApiError, apiFetch } from '@/lib/api';
import { requireAdmin } from '@/lib/dal';
import { getSessionToken } from '@/lib/session';
import type { ProductOption } from './form-state';

async function token(): Promise<string | undefined> {
  await requireAdmin();
  return getSessionToken();
}

export async function fetchSaleWindows(): Promise<AdminSaleWindowDto[]> {
  return apiFetch<AdminSaleWindowDto[]>('/admin/sale-windows', { token: await token() });
}

/** Langas arba notFound() (rodomas [id]/not-found.tsx). */
export async function fetchSaleWindow(id: string): Promise<AdminSaleWindowDto> {
  try {
    return await apiFetch<AdminSaleWindowDto>(`/admin/sale-windows/${encodeURIComponent(id)}`, {
      token: await token(),
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}

/** Produktai prekių pasirinkimui (archyvuoti taip pat, kad būtų matyti esamų prekių vardai). */
export async function fetchProductOptions(): Promise<ProductOption[]> {
  const products = await apiFetch<AdminProductDto[]>('/admin/products', { token: await token() });
  return products.map((p) => ({
    id: p.id,
    name: p.name,
    isActive: p.isActive,
    variants: p.variants,
  }));
}

/** Parduota / iš viso visose lango prekėse. */
export function quantitySummary(w: AdminSaleWindowDto): { sold: number; total: number } {
  return w.items.reduce(
    (acc, i) => ({ sold: acc.sold + i.sold, total: acc.total + i.quantityTotal }),
    { sold: 0, total: 0 },
  );
}

/** Atsiėmimo sąrašas: neatšaukti lango užsakymai pagal pirkėjo vardą. */
export async function fetchPickupList(windowId: string): Promise<AdminPickupOrderDto[]> {
  return apiFetch<AdminPickupOrderDto[]>(
    `/admin/orders/pickup-list?saleWindowId=${encodeURIComponent(windowId)}`,
    { token: await token() },
  );
}
