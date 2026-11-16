import { z } from 'zod';
import type { FulfillmentMethod, PaymentStatus, SpecialOrderStatus } from '../enums';
import { centsSchema, customerInputSchema, fulfillmentInputSchema, objectIdSchema } from './common';

/**
 * Minimalus kiekis ir „kiek dienų iš anksto“ tikrinami backende pagal
 * product.specialOrder.minQuantity ir settings.specialOrders.leadTimeDays.
 */
export const createSpecialOrderInputSchema = z
  .object({
    customer: customerInputSchema,
    desiredDate: z.coerce.date(),
    items: z
      .array(
        z.object({
          variantId: objectIdSchema,
          quantity: z.number().int().positive().max(10000),
        }),
      )
      .min(1)
      .max(50),
    customerNotes: z.string().trim().max(2000).optional(),
    fulfillment: fulfillmentInputSchema.optional(),
  })
  .refine((o) => new Set(o.items.map((i) => i.variantId)).size === o.items.length, {
    message: 'Ta pati prekė kartojasi',
    path: ['items'],
  });
export type CreateSpecialOrderInput = z.infer<typeof createSpecialOrderInputSchema>;

export const confirmSpecialOrderInputSchema = z.object({
  totalCents: centsSchema,
  adminMessage: z.string().trim().max(2000).optional(),
});
export type ConfirmSpecialOrderInput = z.infer<typeof confirmSpecialOrderInputSchema>;

export const rejectSpecialOrderInputSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
});
export type RejectSpecialOrderInput = z.infer<typeof rejectSpecialOrderInputSchema>;

export interface SpecialOrderDto {
  id: string;
  requestNumber: string;
  customer: { name: string; email: string; phone: string };
  desiredDate: string;
  items: {
    productId: string;
    variantId: string;
    productName: string;
    variantName: string;
    quantity: number;
    estimatedUnitPriceCents: number;
  }[];
  estimatedTotalCents: number;
  customerNotes: string | null;
  fulfillment: { method: FulfillmentMethod; address: string | null } | null;
  status: SpecialOrderStatus;
  confirmation: { totalCents: number; adminMessage: string | null; confirmedAt: string } | null;
  rejectionReason: string | null;
  payment: { status: PaymentStatus; method: string | null; paidAt: string | null } | null;
  createdAt: string;
  updatedAt: string;
}
