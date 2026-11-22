import type { OrderAccessDto, OrderDto } from '@desert-web/shared';
import type { SaleWindow } from '../sale-windows/sale-window.schema';
import type { Order, OrderItem } from './order.schema';

/** Eilutės pakavimo laukai; seni užsakymai jų neturi (0). */
export function giftWrapOfItem(i: OrderItem) {
  return {
    giftWrapQuantity: i.giftWrapQuantity ?? 0,
    giftWrapUnitPriceCents: i.giftWrapUnitPriceCents ?? 0,
    giftWrapTotalCents: i.giftWrapTotalCents ?? 0,
  };
}

/** Sumos; seni užsakymai be išskaidymo: prekės = totalCents, pakavimas = 0. */
export function orderTotals(o: Order) {
  const giftWrapTotalCents = o.giftWrapTotalCents ?? 0;
  return {
    itemsTotalCents: o.itemsTotalCents ?? o.totalCents - giftWrapTotalCents,
    giftWrapTotalCents,
    totalCents: o.totalCents,
  };
}

export function toOrderDto(o: Order): OrderDto {
  return {
    id: o._id.toString(),
    orderNumber: o.orderNumber,
    saleWindowId: o.saleWindowId.toString(),
    customer: { name: o.customer.name, email: o.customer.email, phone: o.customer.phone },
    items: o.items.map((i) => ({
      productId: i.productId.toString(),
      variantId: i.variantId.toString(),
      productName: i.productName,
      variantName: i.variantName,
      unitPriceCents: i.unitPriceCents,
      quantity: i.quantity,
      lineTotalCents: i.lineTotalCents,
      ...giftWrapOfItem(i),
    })),
    ...orderTotals(o),
    currency: 'EUR',
    fulfillment: {
      method: o.fulfillment.method,
      address: o.fulfillment.address ?? null,
      notes: o.fulfillment.notes ?? null,
    },
    status: o.status,
    payment: o.payment
      ? {
          status: o.payment.status,
          method: o.payment.method ?? null,
          paidAt: o.payment.paidAt?.toISOString() ?? null,
        }
      : null,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

/** Pirkėjo užsakymo vaizdas. Langas gali būti ištrintas tik teoriškai (su užsakymais trinti negalima). */
export function toOrderAccessDto(
  o: Order,
  saleWindow: Pick<SaleWindow, '_id' | 'title' | 'fulfillment'> | null,
): OrderAccessDto {
  const f = saleWindow?.fulfillment;
  return {
    ...toOrderDto(o),
    saleWindow: {
      id: o.saleWindowId.toString(),
      title: saleWindow?.title ?? '',
      pickupLocation: f?.pickupLocation ?? null,
      pickupFrom: f?.pickupFrom?.toISOString() ?? null,
      pickupTo: f?.pickupTo?.toISOString() ?? null,
    },
  };
}
