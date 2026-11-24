import type {
  AdminSpecialOrderDto,
  AdminSpecialOrderListItemDto,
  SpecialOrderDto,
} from '@desert-web/shared';
import type { Types } from 'mongoose';
import type { SpecialOrder } from './special-order.schema';

/** Admino ID → el. paštas (istorijai). Ištrintų adminų čia nėra. */
export type AdminEmails = Map<string, string>;

/** Pirkėjo vaizdas: be būsenų istorijos, adminų ID, clientRequestId ir accessToken. */
export function toSpecialOrderDto(o: SpecialOrder): SpecialOrderDto {
  const c = o.confirmation;
  return {
    id: o._id.toString(),
    requestNumber: o.requestNumber,
    customer: { name: o.customer.name, email: o.customer.email, phone: o.customer.phone },
    desiredDate: o.desiredDate,
    items: o.items.map((i) => ({
      productId: i.productId.toString(),
      variantId: i.variantId.toString(),
      productName: i.productName,
      variantName: i.variantName,
      quantity: i.quantity,
      estimatedUnitPriceCents: i.estimatedUnitPriceCents,
      estimatedLineTotalCents: i.estimatedLineTotalCents,
    })),
    estimatedTotalCents: o.estimatedTotalCents,
    currency: 'EUR',
    customerNotes: o.customerNotes ?? null,
    fulfillment: { method: o.fulfillment.method, address: o.fulfillment.address ?? null },
    status: o.status,
    confirmation: c
      ? {
          totalCents: c.totalCents,
          adminMessage: c.adminMessage ?? null,
          pickupFrom: c.pickupFrom.toISOString(),
          pickupTo: c.pickupTo.toISOString(),
          pickupLocation: c.pickupLocation,
          confirmedAt: c.confirmedAt.toISOString(),
        }
      : null,
    rejectionReason: o.rejectionReason ?? null,
    cancellation: o.cancellation
      ? {
          reason: o.cancellation.reason ?? null,
          cancelledAt: o.cancellation.cancelledAt.toISOString(),
        }
      : null,
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

export function toAdminSpecialOrderDto(
  o: SpecialOrder,
  adminEmails: AdminEmails = new Map(),
): AdminSpecialOrderDto {
  return {
    ...toSpecialOrderDto(o),
    statusHistory: (o.statusHistory ?? []).map((h) => ({
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

export function toAdminSpecialOrderListItemDto(o: SpecialOrder): AdminSpecialOrderListItemDto {
  return {
    id: o._id.toString(),
    requestNumber: o.requestNumber,
    createdAt: o.createdAt.toISOString(),
    customer: { name: o.customer.name, email: o.customer.email, phone: o.customer.phone },
    desiredDate: o.desiredDate,
    items: o.items.map((i) => ({
      productName: i.productName,
      variantName: i.variantName,
      quantity: i.quantity,
    })),
    estimatedTotalCents: o.estimatedTotalCents,
    totalCents: o.confirmation?.totalCents ?? null,
    status: o.status,
  };
}

/** Adminų ID iš būsenų istorijos (el. paštams rasti). */
export function adminIdsOf(o: SpecialOrder): Types.ObjectId[] {
  return (o.statusHistory ?? []).flatMap((h) => (h.adminId ? [h.adminId] : []));
}
