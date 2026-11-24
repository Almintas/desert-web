import { z } from 'zod';
import {
  type FulfillmentMethod,
  type PaymentStatus,
  SPECIAL_ORDER_STATUSES,
  type SpecialOrderStatus,
} from '../enums';
import { isCalendarDate } from '../time';
import { centsSchema, customerInputSchema, objectIdSchema } from './common';
import type { PublicProductImageDto } from './product-image';

/**
 * Kalendorinė data „YYYY-MM-DD“ (be laiko), suprantama Vilniaus laiku. Saugoma ir grąžinama
 * kaip eilutė, todėl negali pasislinkti per dieną dėl laiko zonos ar vasaros laiko.
 */
export const calendarDateSchema = z
  .string({ error: 'Pasirinkite datą' })
  .trim()
  .refine(isCalendarDate, 'Netinkama data');

/** ISO laikas su zona (admin app jį sudaro iš Vilniaus laiko, žr. vilniusLocalToUtc). */
const isoDateTimeSchema = z.iso
  .datetime({ offset: true, error: 'Netinkamas laikas' })
  .transform((v) => new Date(v));

/** Didžiausias vienos eilutės kiekis (specialūs užsakymai yra dideli, bet ne begaliniai). */
export const SPECIAL_ORDER_MAX_QUANTITY = 10_000;

/**
 * POST /special-orders. Minimalus kiekis (product.specialOrder.minQuantity), produkto
 * tinkamumas ir pageidaujamos datos ribos (settings.specialOrders) tikrinami backende.
 * Atsiėmimo būdo nėra: specialūs užsakymai visada atsiimami (fulfillment = pickup).
 */
export const createSpecialOrderInputSchema = z
  .object({
    /** Kliento UUID vienam pateikimui (idempotencija, kaip POST /orders). */
    clientRequestId: z.uuid('Netinkamas užklausos ID'),
    customer: customerInputSchema,
    desiredDate: calendarDateSchema,
    items: z
      .array(
        z.object({
          variantId: objectIdSchema,
          quantity: z
            .number({ error: 'Įveskite kiekį' })
            .int('Kiekis turi būti sveikasis skaičius')
            .positive('Kiekis turi būti bent 1')
            .max(SPECIAL_ORDER_MAX_QUANTITY, 'Per didelis kiekis'),
        }),
      )
      .min(1, 'Pasirinkite bent vieną prekę')
      .max(50, 'Per daug prekių'),
    customerNotes: z
      .string()
      .trim()
      .max(2000, 'Per ilgos pastabos (iki 2000 simbolių)')
      .optional()
      .transform((v) => v || undefined),
    /** Turnstile tokenas. Neprivalomas tik idempotentiškam pakartojimui (kaip POST /orders). */
    turnstileToken: z.string().trim().min(1).max(2048).optional(),
  })
  .refine((o) => new Set(o.items.map((i) => i.variantId)).size === o.items.length, {
    message: 'Ta pati prekė kartojasi',
    path: ['items'],
  });
export type CreateSpecialOrderInput = z.infer<typeof createSpecialOrderInputSchema>;
export type CreateSpecialOrderInputBody = z.input<typeof createSpecialOrderInputSchema>;

/**
 * POST /admin/special-orders/:id/confirm. Galutinė kaina gali skirtis nuo apskaičiuotos.
 * Atsiėmimo laikas: diena ir laiko intervalas Vilniaus laiku (admin app verčia į UTC ISO).
 */
export const confirmSpecialOrderInputSchema = z
  .object({
    totalCents: centsSchema.max(100_000_000, 'Per didelė suma'),
    adminMessage: z
      .string()
      .trim()
      .max(2000, 'Per ilga žinutė (iki 2000 simbolių)')
      .optional()
      .transform((v) => v || undefined),
    pickupFrom: isoDateTimeSchema,
    pickupTo: isoDateTimeSchema,
    pickupLocation: z
      .string({ error: 'Įvesk atsiėmimo vietą' })
      .trim()
      .min(1, 'Įvesk atsiėmimo vietą')
      .max(300, 'Per ilgas adresas'),
  })
  .refine((c) => c.pickupTo > c.pickupFrom, {
    message: 'Pabaiga turi būti vėliau nei pradžia',
    path: ['pickupTo'],
  });
export type ConfirmSpecialOrderInput = z.output<typeof confirmSpecialOrderInputSchema>;
export type ConfirmSpecialOrderInputBody = z.input<typeof confirmSpecialOrderInputSchema>;

export const rejectSpecialOrderInputSchema = z.object({
  reason: z
    .string({ error: 'Įvesk priežastį' })
    .trim()
    .min(1, 'Įvesk priežastį')
    .max(2000, 'Per ilga priežastis'),
});
export type RejectSpecialOrderInput = z.infer<typeof rejectSpecialOrderInputSchema>;

export const cancelSpecialOrderInputSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(2000, 'Per ilga priežastis')
    .optional()
    .transform((v) => v || undefined),
});
export type CancelSpecialOrderInput = z.infer<typeof cancelSpecialOrderInputSchema>;

// --- DTO ---

export interface SpecialOrderItemDto {
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  quantity: number;
  /** Bazinė varianto kaina užklausos metu (kopija). */
  estimatedUnitPriceCents: number;
  /** estimatedUnitPriceCents × quantity. */
  estimatedLineTotalCents: number;
}

export interface SpecialOrderConfirmationDto {
  /** Galutinė suma (gali skirtis nuo estimatedTotalCents). */
  totalCents: number;
  adminMessage: string | null;
  pickupFrom: string;
  pickupTo: string;
  pickupLocation: string;
  confirmedAt: string;
}

/**
 * Specialus užsakymas pirkėjui (POST /special-orders ir GET /special-orders/access/:token):
 * be vidinių laukų (būsenų istorijos, adminų ID, clientRequestId, accessToken).
 */
export interface SpecialOrderDto {
  id: string;
  /** „SP-2026-0007“ */
  requestNumber: string;
  customer: { name: string; email: string; phone: string };
  /** Pageidaujama data „YYYY-MM-DD“ (Vilniaus kalendorius). */
  desiredDate: string;
  items: SpecialOrderItemDto[];
  estimatedTotalCents: number;
  currency: 'EUR';
  customerNotes: string | null;
  /** Visada atsiėmimas (pristatymas lieka modelyje, bet nesiūlomas). */
  fulfillment: { method: FulfillmentMethod; address: string | null };
  status: SpecialOrderStatus;
  confirmation: SpecialOrderConfirmationDto | null;
  rejectionReason: string | null;
  cancellation: { reason: string | null; cancelledAt: string } | null;
  payment: { status: PaymentStatus; method: string | null; paidAt: string | null } | null;
  createdAt: string;
  updatedAt: string;
}

/** 201 naujai užklausai, 200 pakartojimui su tuo pačiu clientRequestId. */
export interface CreateSpecialOrderResponse {
  specialOrder: SpecialOrderDto;
  accessToken: string;
}

/** Produktas, kurį galima užsakyti specialiu užsakymu (GET /special-orders/config). */
export interface SpecialOrderProductDto {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  allergens: string[];
  images: PublicProductImageDto[];
  /** Mažiausias kiekis kiekvienai šio produkto eilutei (variantui). */
  minQuantity: number;
  /** Bazinės kainos (galutinę kainą nurodo adminas tvirtindamas). */
  variants: { id: string; name: string; priceCents: number }[];
}

/** GET /special-orders/config. Išjungus: enabled false ir tuščias products. */
export interface SpecialOrderConfigDto {
  enabled: boolean;
  leadTimeDays: number;
  maxDaysAhead: number;
  /** Anksčiausia leidžiama data „YYYY-MM-DD“ (šiandien Vilniuje + leadTimeDays). */
  earliestDate: string;
  /** Vėliausia leidžiama data „YYYY-MM-DD“ (šiandien Vilniuje + maxDaysAhead). */
  latestDate: string;
  products: SpecialOrderProductDto[];
}

/** QUANTITY_BELOW_MINIMUM `details.items` eilutė. */
export interface SpecialOrderQuantityProblemDto {
  variantId: string;
  requested: number;
  minimum: number;
}

/** Klaidų kodai (laukas `code` klaidos atsakyme) iš /special-orders ir /admin/special-orders. */
export const SPECIAL_ORDER_ERROR_CODES = [
  /** 409: specialūs užsakymai išjungti nustatymuose. */
  'SPECIAL_ORDERS_DISABLED',
  /**
   * 400: produktas archyvuotas, jam išjungti specialūs užsakymai arba variantas neegzistuoja.
   * `details.items`: [{ variantId, requested }].
   */
  'PRODUCT_NOT_AVAILABLE',
  /** 400: `details.items`: SpecialOrderQuantityProblemDto[]. */
  'QUANTITY_BELOW_MINIMUM',
  /** 400: `details.earliestDate`. */
  'DESIRED_DATE_TOO_EARLY',
  /** 400: `details.latestDate`. */
  'DESIRED_DATE_TOO_LATE',
  /** 409: tas pats clientRequestId jau panaudotas kitam pirkėjui. */
  'IDEMPOTENCY_CONFLICT',
  /** 403 / 503: kaip POST /orders. */
  'TURNSTILE_FAILED',
  'TURNSTILE_UNAVAILABLE',
  /** 403: produkcijoje tik iš web serverio (INTERNAL_API_SECRET). */
  'FORBIDDEN_CLIENT',
  /** 429 (antraštė Retry-After). */
  'TOO_MANY_REQUESTS',
  /** Admin: 404. */
  'SPECIAL_ORDER_NOT_FOUND',
  /** Admin: 409, perėjimas negalimas iš dabartinės būsenos (`status`, `requestedStatus`). */
  'INVALID_STATUS_TRANSITION',
] as const;
export type SpecialOrderErrorCode = (typeof SPECIAL_ORDER_ERROR_CODES)[number];

// --- Admin: /admin/special-orders ---

const statusListSchema = z.preprocess(
  (v) =>
    v === undefined || v === ''
      ? undefined
      : [v].flat().flatMap((s) => String(s).split(',').filter(Boolean)),
  z.array(z.enum(SPECIAL_ORDER_STATUSES, { error: 'Netinkama būsena' })).optional(),
);

const optionalCalendarDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || undefined)
  .refine((v) => v === undefined || isCalendarDate(v), 'Netinkama data');

/** Rikiuojama pagal pageidaujamą datą (artimiausios pirmos). */
export const adminSpecialOrderListQuerySchema = z.object({
  /** Kelios būsenos per kablelį ("requested,confirmed"). Be jo: visos. */
  status: statusListSchema,
  /** Pageidaujama data nuo / iki (imtinai, „YYYY-MM-DD“). */
  desiredFrom: optionalCalendarDate,
  desiredTo: optionalCalendarDate,
  /** Užklausos numeris, vardas, el. paštas arba telefonas. */
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => v || undefined),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type AdminSpecialOrderListQuery = z.output<typeof adminSpecialOrderListQuerySchema>;

export interface AdminSpecialOrderListItemDto {
  id: string;
  requestNumber: string;
  createdAt: string;
  customer: { name: string; email: string; phone: string };
  desiredDate: string;
  items: { productName: string; variantName: string; quantity: number }[];
  estimatedTotalCents: number;
  /** Galutinė suma (null, kol nepatvirtinta). */
  totalCents: number | null;
  status: SpecialOrderStatus;
}

export interface AdminSpecialOrderListResponse {
  items: AdminSpecialOrderListItemDto[];
  total: number;
  page: number;
  pageSize: number;
  /** Kiekiai pagal būseną su datų ir paieškos filtrais, bet be būsenos filtro (skirtukams). */
  counts: Record<SpecialOrderStatus, number> & { all: number };
}

/** GET /admin/special-orders/stats: navigacijos ženkleliui. */
export interface AdminSpecialOrderStatsDto {
  requested: number;
}

export interface SpecialOrderStatusHistoryEntryDto {
  status: SpecialOrderStatus;
  at: string;
  /** null: pirkėjo pateikta užklausa. */
  adminId: string | null;
  /** null, kai pateikė pirkėjas arba adminas ištrintas. */
  adminEmail: string | null;
}

export interface AdminSpecialOrderDto extends SpecialOrderDto {
  statusHistory: SpecialOrderStatusHistoryEntryDto[];
  cancellation: { reason: string | null; cancelledAt: string; cancelledBy: string | null } | null;
}
