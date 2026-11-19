import { z } from 'zod';
import type { SaleWindowStatus } from '../enums';
import type { SaleWindowPhase } from '../sale-window';
import { objectIdSchema } from './common';
import type { PublicProductImageDto } from './product-image';

/** ISO data su laiko zona (admin app ją sudaro iš Vilniaus laiko, žr. vilniusLocalToUtc). */
const isoDateSchema = z.iso
  .datetime({ offset: true, error: 'Netinkama data' })
  .transform((v) => new Date(v));

const optionalLimitSchema = z
  .number({ error: 'Įvesk skaičių' })
  .int('Turi būti sveikasis skaičius')
  .positive('Turi būti bent 1')
  .optional();

/**
 * Lango prekė. Tapatybė yra `variantId` (kaip užsakymuose): PUT metu esama prekė
 * randama pagal jį, todėl kiekis ir kaina keičiami vietoje.
 */
export const adminSaleWindowItemInputSchema = z
  .object({
    productId: objectIdSchema,
    variantId: objectIdSchema,
    /** Lango kaina (gali skirtis nuo bazinės varianto kainos). Keičia tik naujus užsakymus. */
    priceCents: z
      .number({ error: 'Įvesk kainą' })
      .int('Kaina turi būti nurodyta centais')
      .nonnegative('Kaina negali būti neigiama'),
    /** Visas kiekis. Parduota = quantityTotal - quantityAvailable; mažiau nei parduota negalima. */
    quantityTotal: z
      .number({ error: 'Įvesk kiekį' })
      .int('Turi būti sveikasis skaičius')
      .nonnegative('Kiekis negali būti neigiamas')
      .max(100_000, 'Per didelis kiekis'),
    maxPerOrder: optionalLimitSchema,
    maxPerCustomer: optionalLimitSchema,
  })
  .refine((i) => !i.maxPerOrder || !i.maxPerCustomer || i.maxPerOrder <= i.maxPerCustomer, {
    message: 'Negali būti didesnis už limitą vienam pirkėjui',
    path: ['maxPerOrder'],
  });
export type AdminSaleWindowItemInput = z.infer<typeof adminSaleWindowItemInputSchema>;

/**
 * POST / PUT /admin/sale-windows. Būsenos čia nėra: kuriama visada kaip juodraštis,
 * o būsena keičiama atskirais veiksmais (publish, unpublish, cancel, open-now, close-now).
 */
export const adminSaleWindowInputSchema = z
  .object({
    title: z.string().trim().min(1, 'Įvesk pavadinimą').max(120, 'Per ilgas pavadinimas'),
    opensAt: isoDateSchema,
    closesAt: isoDateSchema,
    fulfillment: z.object({
      pickupAvailable: z.boolean(),
      pickupLocation: z.string().trim().max(300, 'Per ilgas adresas').optional(),
      pickupFrom: isoDateSchema.optional(),
      pickupTo: isoDateSchema.optional(),
      deliveryAvailable: z.boolean(),
    }),
    items: z
      .array(adminSaleWindowItemInputSchema)
      .min(1, 'Lange turi būti bent viena prekė')
      .max(100, 'Per daug prekių'),
  })
  .superRefine((w, ctx) => {
    if (w.closesAt <= w.opensAt) {
      ctx.addIssue({
        code: 'custom',
        path: ['closesAt'],
        message: 'Pabaiga turi būti vėliau nei pradžia',
      });
    }
    const f = w.fulfillment;
    if (!f.pickupAvailable && !f.deliveryAvailable) {
      ctx.addIssue({
        code: 'custom',
        path: ['fulfillment'],
        message: 'Reikia bent atsiėmimo arba pristatymo',
      });
    }
    if (f.pickupFrom && f.pickupTo && f.pickupTo <= f.pickupFrom) {
      ctx.addIssue({
        code: 'custom',
        path: ['fulfillment', 'pickupTo'],
        message: 'Atsiėmimo pabaiga turi būti vėliau nei pradžia',
      });
    }
    const seen = new Set<string>();
    w.items.forEach((item, i) => {
      if (seen.has(item.variantId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', i, 'variantId'],
          message: 'Ši prekė lange jau yra',
        });
      }
      seen.add(item.variantId);
    });
  });
/** Atsiėmimo laukai, privalomi paskelbtam langui (PICKUP_INFO_REQUIRED). */
export const PICKUP_INFO_FIELDS = [
  'pickupAvailable',
  'pickupLocation',
  'pickupFrom',
  'pickupTo',
] as const;
export type PickupInfoField = (typeof PICKUP_INFO_FIELDS)[number];

/** Kurių atsiėmimo laukų trūksta, kad langą būtų galima paskelbti. */
export function missingPickupInfo(f: {
  pickupAvailable?: boolean | null;
  pickupLocation?: string | null;
  pickupFrom?: Date | string | null;
  pickupTo?: Date | string | null;
}): PickupInfoField[] {
  const missing: PickupInfoField[] = [];
  if (!f.pickupAvailable) missing.push('pickupAvailable');
  if (!f.pickupLocation?.trim()) missing.push('pickupLocation');
  if (!f.pickupFrom) missing.push('pickupFrom');
  if (!f.pickupTo) missing.push('pickupTo');
  return missing;
}

/** Įvestis (ką siunčia klientas: datos kaip ISO eilutės). */
export type AdminSaleWindowInputBody = z.input<typeof adminSaleWindowInputSchema>;
/** Po validacijos (datos kaip Date). */
export type AdminSaleWindowInput = z.output<typeof adminSaleWindowInputSchema>;

/** Viešas lango vaizdas pirkėjams (be quantityTotal ir kitų vidinių duomenų). */
export interface PublicSaleWindowItemDto {
  productId: string;
  variantId: string;
  productName: string;
  productSlug: string;
  variantName: string;
  /** Pagrindinės nuotraukos URL (= images[0].url) arba null. */
  imageUrl: string | null;
  /** Produkto nuotraukos, pagrindinė pirmoji. */
  images: PublicProductImageDto[];
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

export interface AdminSaleWindowItemDto extends PublicSaleWindowItemDto {
  /** false: produktas archyvuotas (lange lieka ir parduodamas, kol adminas jo neišima). */
  productActive: boolean;
  quantityTotal: number;
  /** quantityTotal - quantityAvailable. Mažiausias leidžiamas naujas quantityTotal. */
  sold: number;
  maxPerCustomer: number | null;
  /** Neatšauktų užsakymų su šia preke skaičius. Jei > 0, prekės išimti negalima. */
  ordersCount: number;
}

export interface AdminSaleWindowDto extends Omit<PublicSaleWindowDto, 'items'> {
  status: SaleWindowStatus;
  items: AdminSaleWindowItemDto[];
  /** Neatšauktų užsakymų skaičius lange. */
  ordersCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Klaidų kodai, kuriuos grąžina /admin/sale-windows (laukas `code` klaidos atsakyme). */
export const SALE_WINDOW_ERROR_CODES = [
  /** 404 */
  'SALE_WINDOW_NOT_FOUND',
  /** 409: paskelbto lango laikas kertasi su kitu paskelbtu langu (`window: { id, title }`). */
  'WINDOW_OVERLAP',
  /** 409: naujas kiekis mažesnis nei parduota (`variantId`, `sold`, `requestedTotal`). */
  'QUANTITY_BELOW_SOLD',
  /** 409: išimama prekė, kurią turi neatšaukti užsakymai (`variantId`). */
  'ITEM_HAS_ORDERS',
  /** 409: grąžinti į juodraštį, atšaukti ar ištrinti negalima, nes yra neatšauktų užsakymų. */
  'WINDOW_HAS_ORDERS',
  /**
   * 409: skelbti / atidaryti (ar keisti paskelbtą langą) be atsiėmimo informacijos negalima
   * (`missing`: trūkstami laukai, pvz. ["pickupLocation", "pickupFrom"]).
   */
  'PICKUP_INFO_REQUIRED',
  /** 409: atšauktas langas tik skaitomas. */
  'WINDOW_CANCELLED',
  /** 409: veiksmas negalimas dabartinėje būsenoje (pvz., uždaryti neatidarytą langą). */
  'INVALID_STATUS',
  /** 400: produkto nėra (`variantId`). */
  'PRODUCT_NOT_FOUND',
  /** 400: naujai pridedamas archyvuotas produktas (`variantId`). */
  'PRODUCT_INACTIVE',
  /** 400: variantas nepriklauso nurodytam produktui (`variantId`). */
  'VARIANT_NOT_FOUND',
] as const;
export type SaleWindowErrorCode = (typeof SALE_WINDOW_ERROR_CODES)[number];
