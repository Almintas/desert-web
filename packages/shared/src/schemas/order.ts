import { z } from 'zod';
import type { FulfillmentMethod, OrderStatus, PaymentStatus } from '../enums';
import { customerInputSchema, fulfillmentInputSchema, objectIdSchema } from './common';

export const orderItemInputSchema = z.object({
  variantId: objectIdSchema,
  quantity: z.number().int().positive().max(1000),
});

export const createOrderInputSchema = z
  .object({
    saleWindowId: objectIdSchema,
    customer: customerInputSchema,
    items: z.array(orderItemInputSchema).min(1).max(50),
    fulfillment: fulfillmentInputSchema,
  })
  .refine((o) => new Set(o.items.map((i) => i.variantId)).size === o.items.length, {
    message: 'Ta pati prekė kartojasi',
    path: ['items'],
  });
export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;

export interface OrderItemDto {
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
}

export interface OrderDto {
  id: string;
  orderNumber: string;
  saleWindowId: string;
  customer: { name: string; email: string; phone: string };
  items: OrderItemDto[];
  totalCents: number;
  currency: 'EUR';
  fulfillment: { method: FulfillmentMethod; address: string | null; notes: string | null };
  status: OrderStatus;
  payment: { status: PaymentStatus; method: string | null; paidAt: string | null } | null;
  createdAt: string;
  updatedAt: string;
}
