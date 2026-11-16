import { z } from 'zod';
import { SALE_WINDOW_STATUSES } from '../enums';
import type { SaleWindowPhase } from '../sale-window';
import { centsSchema, objectIdSchema } from './common';

export const saleWindowItemInputSchema = z
  .object({
    productId: objectIdSchema,
    variantId: objectIdSchema,
    priceCents: centsSchema,
    quantityTotal: z.number().int().positive(),
    maxPerOrder: z.number().int().positive().optional(),
    maxPerCustomer: z.number().int().positive().optional(),
  })
  .refine((i) => !i.maxPerOrder || !i.maxPerCustomer || i.maxPerOrder <= i.maxPerCustomer, {
    message: 'maxPerOrder negali būti didesnis už maxPerCustomer',
    path: ['maxPerOrder'],
  });

export const saleWindowInputSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    status: z.enum(SALE_WINDOW_STATUSES).default('draft'),
    opensAt: z.coerce.date(),
    closesAt: z.coerce.date(),
    fulfillment: z.object({
      pickupAvailable: z.boolean(),
      pickupLocation: z.string().trim().max(300).optional(),
      pickupFrom: z.coerce.date().optional(),
      pickupTo: z.coerce.date().optional(),
      deliveryAvailable: z.boolean(),
    }),
    items: z.array(saleWindowItemInputSchema).min(1, 'Lange turi būti bent viena prekė'),
  })
  .refine((w) => w.closesAt > w.opensAt, {
    message: 'Pabaiga turi būti vėliau nei pradžia',
    path: ['closesAt'],
  })
  .refine((w) => w.fulfillment.pickupAvailable || w.fulfillment.deliveryAvailable, {
    message: 'Reikia bent atsiėmimo arba pristatymo',
    path: ['fulfillment'],
  });
export type SaleWindowInput = z.infer<typeof saleWindowInputSchema>;

/** Viešas lango vaizdas pirkėjams (be quantityTotal ir kitų vidinių duomenų). */
export interface PublicSaleWindowItemDto {
  productId: string;
  variantId: string;
  productName: string;
  productSlug: string;
  variantName: string;
  imageUrl: string | null;
  priceCents: number;
  quantityAvailable: number;
  maxPerOrder: number | null;
}

export interface PublicSaleWindowDto {
  id: string;
  title: string;
  phase: SaleWindowPhase;
  opensAt: string;
  closesAt: string;
  fulfillment: {
    pickupAvailable: boolean;
    pickupLocation: string | null;
    pickupFrom: string | null;
    pickupTo: string | null;
    deliveryAvailable: boolean;
  };
  items: PublicSaleWindowItemDto[];
}

/** /sale-windows/current atsakymas: atidarytas langas, arba artimiausias būsimas. */
export interface CurrentSaleWindowResponse {
  open: PublicSaleWindowDto | null;
  upcoming: PublicSaleWindowDto | null;
}
