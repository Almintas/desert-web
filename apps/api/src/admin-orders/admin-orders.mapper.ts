import type { AdminOrderDto, AdminOrderListItemDto } from '@desert-web/shared';
import type { Types } from 'mongoose';
import type { Order } from '../orders/order.schema';
import { toOrderDto } from '../orders/orders.mapper';

export type WindowTitles = Map<string, string>;
/** Admino ID → el. paštas (istorijai). Ištrintų adminų čia nėra. */
export type AdminEmails = Map<string, string>;

function windowRef(o: Order, titles: WindowTitles) {
  const id = o.saleWindowId.toString();
  return { id, title: titles.get(id) ?? '—' };
}

export function toAdminOrderListItemDto(o: Order, titles: WindowTitles): AdminOrderListItemDto {
  return {
    id: o._id.toString(),
    orderNumber: o.orderNumber,
    createdAt: o.createdAt.toISOString(),
    customer: { name: o.customer.name, phone: o.customer.phone },
    itemCount: o.items.reduce((sum, i) => sum + i.quantity, 0),
    giftWrapQuantity: o.items.reduce((sum, i) => sum + (i.giftWrapQuantity ?? 0), 0),
    totalCents: o.totalCents,
    fulfillmentMethod: o.fulfillment.method,
    status: o.status,
    saleWindow: windowRef(o, titles),
  };
}

export function toAdminOrderDto(
  o: Order,
  titles: WindowTitles,
  adminEmails: AdminEmails = new Map(),
): AdminOrderDto {
  // Užsakymai, sukurti prieš atsirandant statusHistory, jos neturi (arba ji prasideda nuo
  // pirmo admino pakeitimo): sukūrimą rodom kaip „pending“ įrašą su createdAt.
  const stored = o.statusHistory ?? [];
  const history =
    stored[0]?.status === 'pending'
      ? stored
      : [{ status: 'pending' as const, at: o.createdAt, adminId: undefined }, ...stored];
  return {
    ...toOrderDto(o),
    saleWindow: windowRef(o, titles),
    statusHistory: history.map((h) => ({
      status: h.status,
      at: h.at.toISOString(),
      adminId: h.adminId?.toString() ?? null,
      adminEmail: h.adminId ? (adminEmails.get(h.adminId.toString()) ?? null) : null,
    })),
    cancellation: o.cancellation
      ? {
          reason: o.cancellation.reason ?? null,
          cancelledAt: o.cancellation.cancelledAt.toISOString(),
          cancelledBy: o.cancellation.cancelledBy?.toString() ?? null,
        }
      : null,
  };
}

/** Adminų ID iš būsenų istorijos ir atšaukimo (el. paštams rasti). */
export function adminIdsOf(o: Order): Types.ObjectId[] {
  const ids = (o.statusHistory ?? []).flatMap((h) => (h.adminId ? [h.adminId] : []));
  if (o.cancellation?.cancelledBy) ids.push(o.cancellation.cancelledBy);
  return ids;
}
