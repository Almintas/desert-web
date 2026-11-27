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
    /** Ar šią prekę galima supakuoti kaip dovaną (kai pakavimas įjungtas lange). */
    giftWrapAllowed: z.boolean().default(true),
  })
  .refine((i) => !i.maxPerOrder || !i.maxPerCustomer || i.maxPerOrder <= i.maxPerCustomer, {
    message: 'Negali būti didesnis už limitą vienam pirkėjui',
    path: ['maxPerOrder'],
  });
export type AdminSaleWindowItemInput = z.infer<typeof adminSaleWindowItemInputSchema>;

/** Didžiausia dovanų pakavimo kaina už vienetą (100,00 €). */
export const GIFT_WRAP_MAX_PRICE_CENTS = 10_000;

/**
 * Lango dovanų pakavimas. Kaina ir jungiklis keičiami bet kada (ir atidarytame lange):
 * užsakymai saugo kainos kopiją, todėl pakeitimas veikia tik naujus užsakymus.
 */
export const giftWrapInputSchema = z
  .object({
    enabled: z.boolean(),
    priceCents: z
      .number({ error: 'Įvesk kainą' })
      .int('Kaina turi būti nurodyta centais')
      .nonnegative('Kaina negali būti neigiama')
      .max(GIFT_WRAP_MAX_PRICE_CENTS, 'Kaina negali būti didesnė nei 100,00 €'),
  })
  .refine((g) => !g.enabled || g.priceCents > 0, {
    message: 'Įjungus pakavimą, kaina turi būti didesnė už 0',
    path: ['priceCents'],
  });
export type GiftWrapInput = z.infer<typeof giftWrapInputSchema>;

/** Langas be dovanų pakavimo (ir seni langai be šio lauko). */
export const GIFT_WRAP_DISABLED: GiftWrapInput = { enabled: false, priceCents: 0 };

/**
 * POST / PUT /admin/sale-windows. Būsenos čia nėra: kuriama visada kaip juodraštis,
 * o būsena keičiama atskirais veiksmais (publish, unpublish, cancel, open-now, close-now).
 */
export const adminSaleWindowInputSchema = z
  .object({
    title: z.string().trim().min(1, 'Įvesk pavadinimą').max(120, 'Per ilgas pavadinimas'),
    opensAt: isoDateSchema,
    closesAt: isoDateSchema,
    /** Atsiėmimo vieta ir laikas bendri visiems langams: nustatymuose (settings.pickup). */
    fulfillment: z.object({
      pickupAvailable: z.boolean(),
      deliveryAvailable: z.boolean(),
    }),
    /** Neprivaloma: be jo pakavimas išjungtas. */
    giftWrap: giftWrapInputSchema.default(() => ({ ...GIFT_WRAP_DISABLED })),
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
  /** Produkto aprašymas ('' jei nėra). */
  description: string;
  /** Alergenai, kaip įvedė adminas (mažosiomis, pvz. ['kiaušiniai', 'migdolai']); [] jei nėra. */
  allergens: string[];
  /** Pagrindinės nuotraukos URL (= images[0].url) arba null. */
  imageUrl: string | null;
  /** Produkto nuotraukos, pagrindinė pirmoji. */
  images: PublicProductImageDto[];
  priceCents: number;
  quantityAvailable: number;
  maxPerOrder: number | null;
  /**
   * Ar prekę galima supakuoti kaip dovaną. Galioja tik kai lango `giftWrap` ne null
   * (žr. canGiftWrap).
   */
  giftWrapAllowed: boolean;
}

export interface PublicSaleWindowDto {
  id: string;
  title: string;
  phase: SaleWindowPhase;
  opensAt: string;
  closesAt: string;
  fulfillment: {
    pickupAvailable: boolean;
    deliveryAvailable: boolean;
  };
  /** Dovanų pakavimo kaina už vienetą; null, kai lange pakavimas išjungtas. */
  giftWrap: { priceCents: number } | null;
  items: PublicSaleWindowItemDto[];
}

/** Ar šią lango prekę galima supakuoti kaip dovaną (langas leidžia ir prekė leidžia). */
export function canGiftWrap(
  saleWindow: Pick<PublicSaleWindowDto, 'giftWrap'>,
  item: Pick<PublicSaleWindowItemDto, 'giftWrapAllowed'> | undefined,
): boolean {
  return saleWindow.giftWrap !== null && item?.giftWrapAllowed === true;
}

/** /sale-windows/current atsakymas: atidarytas langas, arba artimiausias būsimas. */
export interface CurrentSaleWindowResponse {
  /** Anksčiausiai atidarytas iš `openWindows` (null, jei nė vienas neatidarytas). */
  open: PublicSaleWindowDto | null;
  /** Visi šiuo metu atidaryti langai (gali persidengti), anksčiausiai atidarytas pirmas. */
  openWindows: PublicSaleWindowDto[];
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

export interface AdminSaleWindowDto extends Omit<PublicSaleWindowDto, 'items' | 'giftWrap'> {
  status: SaleWindowStatus;
  /** Kaina išsaugoma ir išjungus (kad įjungus vėl nereikėtų įvesti). */
  giftWrap: GiftWrapInput;
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
  /** 409: naujas kiekis mažesnis nei parduota (`variantId`, `sold`, `requestedTotal`). */
  'QUANTITY_BELOW_SOLD',
  /** 409: išimama prekė, kurią turi neatšaukti užsakymai (`variantId`). */
  'ITEM_HAS_ORDERS',
  /** 409: grąžinti į juodraštį, atšaukti ar ištrinti negalima, nes yra neatšauktų užsakymų. */
  'WINDOW_HAS_ORDERS',
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
