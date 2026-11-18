import type { AdminOrderDto, AdminOrderListItemDto } from '@desert-web/shared';
import type { Order } from '../orders/order.schema';
import { toOrderDto } from '../orders/orders.mapper';

export type WindowTitles = Map<string, string>;

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
    totalCents: o.totalCents,
    fulfillmentMethod: o.fulfillment.method,
    status: o.status,
    saleWindow: windowRef(o, titles),
  };
}

export function toAdminOrderDto(o: Order, titles: WindowTitles): AdminOrderDto {
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
