import { z } from 'zod';
import { type PickupInfo, SOCIAL_DOMAINS, type ShopInfo, type SocialNetwork } from '../shop';

/** Ribos, kurias tikrina ir API, ir admin forma. */
export const SPECIAL_ORDER_LEAD_TIME_DAYS = { min: 0, max: 60 } as const;
export const SPECIAL_ORDER_MAX_DAYS_AHEAD = { min: 1, max: 365 } as const;

const days = (limits: { min: number; max: number }) =>
  z
    .number({ error: 'Įvesk skaičių' })
    .int('Turi būti sveikasis skaičius')
    .min(limits.min, `Ne mažiau kaip ${limits.min}`)
    .max(limits.max, `Ne daugiau kaip ${limits.max}`);

/**
 * Specialių užsakymų nustatymai. Pageidaujama data turi būti tarp
 * šiandien + leadTimeDays ir šiandien + maxDaysAhead (Vilniaus laiku, imtinai).
 */
export const specialOrderSettingsInputSchema = z
  .object({
    /** Ar pirkėjai gali pateikti užklausas (numatyta: išjungta). */
    enabled: z.boolean(),
    /** Mažiausiai kiek dienų iš anksto (0: galima ir šiandienai). */
    leadTimeDays: days(SPECIAL_ORDER_LEAD_TIME_DAYS),
    /** Daugiausiai kiek dienų į priekį. */
    maxDaysAhead: days(SPECIAL_ORDER_MAX_DAYS_AHEAD),
  })
  .refine((s) => s.maxDaysAhead >= s.leadTimeDays, {
    message: 'Turi būti ne mažiau nei „Mažiausiai dienų iš anksto“',
    path: ['maxDaysAhead'],
  });
export type SpecialOrderSettings = z.infer<typeof specialOrderSettingsInputSchema>;

export const DEFAULT_SPECIAL_ORDER_SETTINGS: SpecialOrderSettings = {
  enabled: false,
  leadTimeDays: 7,
  maxDaysAhead: 90,
};

// --- Parduotuvės informacija ---

/** Ilgiausios reikšmės (ir admin formos maxLength). */
export const SHOP_INFO_MAX_LENGTHS = {
  name: 120,
  businessId: 40,
  address: 200,
  email: 120,
  phone: 30,
  url: 300,
  tagline: 120,
  subtagline: 200,
} as const;

const text = (max: number, label: string) =>
  z.string({ error: 'Įvesk tekstą' }).trim().max(max, `${label}: ne daugiau kaip ${max} simbolių`);

const emailSchema = text(SHOP_INFO_MAX_LENGTHS.email, 'El. paštas').refine(
  (v) => v === '' || z.email().safeParse(v).success,
  'Netinkamas el. pašto adresas',
);

/** Telefonas laisvai: tik skaitmenys, tarpai ir „+“ pradžioje, 6–15 skaitmenų. */
const phoneSchema = text(SHOP_INFO_MAX_LENGTHS.phone, 'Telefonas').refine(
  (v) => v === '' || (/^\+?[\d ]+$/.test(v) && /^\d{6,15}$/.test(v.replace(/\D/g, ''))),
  'Telefonas: tik skaitmenys, tarpai ir „+“ (pvz., +370 600 12345)',
);

/** Ar `value` yra https adresas tinklo domene (su www arba be). */
export function isSocialUrl(network: SocialNetwork, value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const domain = SOCIAL_DOMAINS[network];
  const host = url.hostname.toLowerCase();
  return (
    url.protocol === 'https:' &&
    !url.username &&
    !url.password &&
    (host === domain || host === `www.${domain}`)
  );
}

const socialUrl = (network: SocialNetwork) =>
  text(SHOP_INFO_MAX_LENGTHS.url, 'Adresas').refine(
    (v) => v === '' || isSocialUrl(network, v),
    `Įvesk https://${SOCIAL_DOMAINS[network]}/… adresą arba palik tuščią`,
  );

/** Parduotuvės informacija (admin įvestis ir vieša reikšmė). Tuščia eilutė: nerodoma. */
export const shopInfoInputSchema = z.object({
  seller: z.object({
    name: text(SHOP_INFO_MAX_LENGTHS.name, 'Pardavėjas'),
    businessId: text(SHOP_INFO_MAX_LENGTHS.businessId, 'Pažymos Nr. / kodas'),
    address: text(SHOP_INFO_MAX_LENGTHS.address, 'Adresas'),
    email: emailSchema,
    phone: phoneSchema,
  }),
  social: z.object({
    facebook: socialUrl('facebook'),
    instagram: socialUrl('instagram'),
    tiktok: socialUrl('tiktok'),
  }),
  texts: z.object({
    tagline: text(SHOP_INFO_MAX_LENGTHS.tagline, 'Šūkis'),
    subtagline: text(SHOP_INFO_MAX_LENGTHS.subtagline, 'Antra eilutė'),
  }),
});
export type ShopInfoInput = z.infer<typeof shopInfoInputSchema>;

// --- Atsiėmimas ---

export const PICKUP_INFO_MAX_LENGTHS = { location: 200, hours: 100 } as const;

/** Atsiėmimo vieta ir laikas (laisvas tekstas, abu privalomi). */
export const pickupInfoInputSchema = z.object({
  location: text(PICKUP_INFO_MAX_LENGTHS.location, 'Atsiėmimo vieta').min(
    1,
    'Įvesk atsiėmimo vietą',
  ),
  hours: text(PICKUP_INFO_MAX_LENGTHS.hours, 'Atsiėmimo laikas').min(1, 'Įvesk atsiėmimo laiką'),
});
export type PickupInfoInput = z.infer<typeof pickupInfoInputSchema>;

/**
 * GET /shop-info (viešas, be autentifikacijos): tik tai, kas rodoma svetainėje. Kol
 * nustatymai neišsaugoti, numatytosios reikšmės (DEFAULT_SHOP_INFO, defaultPickupInfo).
 */
export interface ShopInfoDto extends ShopInfo {
  pickup: PickupInfo;
}

// --- Visas nustatymų dokumentas ---

/**
 * PUT /admin/settings (tik owner). Atnaujinamos tik atsiųstos dalys (specialOrders, shop,
 * pickup), kiekviena visa; bent viena privaloma.
 */
export const adminSettingsInputSchema = z
  .object({
    specialOrders: specialOrderSettingsInputSchema.optional(),
    shop: shopInfoInputSchema.optional(),
    pickup: pickupInfoInputSchema.optional(),
  })
  .refine((s) => s.specialOrders !== undefined || s.shop !== undefined || s.pickup !== undefined, {
    message: 'Nėra ką išsaugoti',
  });
export type AdminSettingsInput = z.infer<typeof adminSettingsInputSchema>;

/** GET / PUT /admin/settings atsakymas. */
export interface SettingsDto {
  specialOrders: SpecialOrderSettings;
  shop: ShopInfo;
  /** Kol neišsaugota: defaultPickupInfo(shop.seller). */
  pickup: PickupInfo;
  /** null: nustatymai dar niekada nekeisti (numatytosios reikšmės). */
  updatedAt: string | null;
}
