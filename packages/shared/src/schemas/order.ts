import { z } from 'zod';
import {
  type FulfillmentMethod,
  ORDER_STATUSES,
  type OrderStatus,
  type PaymentStatus,
} from '../enums';
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

/**
 * POST /orders atsakymas. accessToken grąžinamas tik vieną kartą: frontas iš jo
 * sudaro pirkėjo nuorodą į užsakymą (GET /orders/access/:accessToken).
 */
export interface CreateOrderResponse {
  order: OrderDto;
  accessToken: string;
}

/** Klaidų kodai, kuriuos grąžina POST /orders ir /admin/orders (laukas `code` klaidos atsakyme). */
export const ORDER_ERROR_CODES = [
  'SALE_WINDOW_NOT_FOUND',
  'SALE_WINDOW_CLOSED',
  'FULFILLMENT_NOT_AVAILABLE',
  'ITEM_NOT_IN_WINDOW',
  'ITEM_UNAVAILABLE',
  'MAX_PER_ORDER_EXCEEDED',
  'MAX_PER_CUSTOMER_EXCEEDED',
  'INSUFFICIENT_STOCK',
  /** Admin: 404. */
  'ORDER_NOT_FOUND',
  /** Admin: 409, būsenos keisti taip negalima (atgal, iš galutinės, pakartotinis atšaukimas). */
  'INVALID_STATUS_TRANSITION',
] as const;
export type OrderErrorCode = (typeof ORDER_ERROR_CODES)[number];

// --- Admin: /admin/orders ---

/** Kelios būsenos per kablelį ("pending,confirmed") arba pakartotiniu parametru. */
const statusListSchema = z.preprocess(
  (v) => (v === undefined ? undefined : [v].flat().flatMap((s) => String(s).split(','))),
  z.array(z.enum(ORDER_STATUSES, { error: 'Netinkama būsena' })).optional(),
);

export const adminOrderListQuerySchema = z.object({
  saleWindowId: objectIdSchema.optional(),
  status: statusListSchema,
  /** Užsakymo numeris, vardas, el. paštas arba telefonas. */
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => v || undefined),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type AdminOrderListQuery = z.output<typeof adminOrderListQuerySchema>;

/** POST /admin/orders/:id/status. Tik pirmyn pagal ORDER_STATUS_FLOW (žr. nextOrderStatuses). */
export const adminOrderStatusInputSchema = z.object({
  status: z.enum(ORDER_STATUSES, { error: 'Netinkama būsena' }),
});
export type AdminOrderStatusInput = z.infer<typeof adminOrderStatusInputSchema>;

/** POST /admin/orders/:id/cancel. */
export const adminCancelOrderInputSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(500, 'Per ilga priežastis')
    .optional()
    .transform((v) => v || undefined),
});
export type AdminCancelOrderInput = z.infer<typeof adminCancelOrderInputSchema>;

export interface AdminOrderListItemDto {
  id: string;
  orderNumber: string;
  createdAt: string;
  customer: { name: string; phone: string };
  /** Vienetų skaičius (visų eilučių kiekių suma). */
  itemCount: number;
  totalCents: number;
  fulfillmentMethod: FulfillmentMethod;
  status: OrderStatus;
  saleWindow: { id: string; title: string };
}

export interface AdminOrderListResponse {
  items: AdminOrderListItemDto[];
  /** Kiek užsakymų atitinka visus filtrus (puslapiavimui). */
  total: number;
  page: number;
  pageSize: number;
  /** Kiekiai pagal būseną su lango ir paieškos filtrais, bet be būsenos filtro (skirtukams). */
  counts: Record<OrderStatus, number> & { all: number };
}

export interface OrderStatusHistoryEntryDto {
  status: OrderStatus;
  at: string;
  /** null: pakeitė sistema (pvz., užsakymo sukūrimas). */
  adminId: string | null;
}

export interface AdminOrderDto extends OrderDto {
  saleWindow: { id: string; title: string };
  /** Seni užsakymai be istorijos gauna vieną „pending“ įrašą su createdAt. */
  statusHistory: OrderStatusHistoryEntryDto[];
  cancellation: { reason: string | null; cancelledAt: string; cancelledBy: string | null } | null;
}
