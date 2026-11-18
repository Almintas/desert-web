import { z } from 'zod';
import { objectIdSchema } from './common';

/** Daugiausia nuotraukų vienam produktui. */
export const PRODUCT_IMAGE_MAX_COUNT = 8;

/** Didžiausias įkeliamo failo dydis (tikrinamas naršyklėje prieš įkeliant). */
export const PRODUCT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

/** Ilgiausia kraštinė po įkėlimo (Cloudinary incoming transformation, c_limit). */
export const PRODUCT_IMAGE_MAX_DIMENSION = 2000;

/** Formatai, kuriuos priima Cloudinary (pasirašytas `allowed_formats`). */
export const PRODUCT_IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'] as const;
export type ProductImageFormat = (typeof PRODUCT_IMAGE_FORMATS)[number];

/** MIME tipai, atitinkantys PRODUCT_IMAGE_FORMATS (failų pasirinkimui ir patikrinimui naršyklėje). */
export const PRODUCT_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

/** `<input type="file" accept>` reikšmė: MIME tipai ir plėtiniai (kai kurios naršyklės HEIC tipo nežino). */
export const PRODUCT_IMAGE_ACCEPT = [
  ...PRODUCT_IMAGE_MIME_TYPES,
  ...PRODUCT_IMAGE_FORMATS.map((f) => `.${f}`),
].join(',');

/**
 * Ar failą galima įkelti (pagal MIME tipą arba, jei jo nėra ar jis bendrinis, pagal plėtinį).
 * Galutinai formatą tikrina Cloudinary pagal pasirašytą `allowed_formats`.
 */
export function isAllowedProductImageFile(file: { name: string; type: string }): boolean {
  if ((PRODUCT_IMAGE_MIME_TYPES as readonly string[]).includes(file.type.toLowerCase())) {
    return true;
  }
  const extension = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? '';
  const genericType = file.type === '' || file.type === 'application/octet-stream';
  return genericType && (PRODUCT_IMAGE_FORMATS as readonly string[]).includes(extension);
}

/**
 * POST /admin/products/:id/images: Cloudinary įkėlimo atsakymo laukai (naršyklė juos persiunčia
 * be pakeitimų). API patikrina `signature` (public_id + version, pasirašyta API paslaptimi),
 * katalogą ir `secureUrl`.
 */
export const attachProductImageInputSchema = z.object({
  publicId: z.string().min(1).max(300),
  version: z.number().int().positive(),
  /** Cloudinary atsakymo parašas: SHA-1 (40) arba SHA-256 (64) hex. */
  signature: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/, 'Netinkamas parašas'),
  width: z.number().int().positive().max(100_000),
  height: z.number().int().positive().max(100_000),
  format: z.enum(PRODUCT_IMAGE_FORMATS),
  bytes: z.number().int().positive(),
  secureUrl: z.url({ protocol: /^https$/ }).max(1000),
});
export type AttachProductImageInput = z.infer<typeof attachProductImageInputSchema>;

/** PUT /admin/products/:id/images/order: visų esamų nuotraukų ID nauja tvarka. */
export const reorderProductImagesInputSchema = z.object({
  imageIds: z
    .array(objectIdSchema)
    .max(PRODUCT_IMAGE_MAX_COUNT)
    .refine((ids) => new Set(ids).size === ids.length, 'Nuotrauka kartojasi'),
});
export type ReorderProductImagesInput = z.infer<typeof reorderProductImagesInputSchema>;

/**
 * POST /admin/uploads/product-image-signature atsakymas. Naršyklė siunčia į `uploadUrl`
 * failą ir lygiai šiuos parametrus (`api_key`, `timestamp`, `signature`, `folder`,
 * `allowed_formats`, `transformation`); bet kurį pakeitus Cloudinary parašą atmeta.
 */
export interface ProductImageUploadSignatureDto {
  cloudName: string;
  apiKey: string;
  uploadUrl: string;
  timestamp: number;
  signature: string;
  folder: string;
  allowedFormats: string;
  transformation: string;
}

/** Vieša nuotrauka (pirkėjams). Pirmoji sąraše yra pagrindinė. */
export interface PublicProductImageDto {
  url: string;
  width: number;
  height: number;
  /** Produkto pavadinimas. */
  alt: string;
}

/** Admino nuotrauka: su ID (maršrutams) ir Cloudinary duomenimis. */
export interface AdminProductImageDto {
  id: string;
  publicId: string;
  version: number;
  url: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
  createdAt: string;
}

/** Klaidų kodai, kuriuos grąžina nuotraukų maršrutai (laukas `code` klaidos atsakyme). */
export const PRODUCT_IMAGE_ERROR_CODES = [
  /** 503: API neturi Cloudinary nustatymų (tik vystant / testuose; produkcijoje API nepasileidžia). */
  'IMAGES_NOT_CONFIGURED',
  /** 404 */
  'PRODUCT_NOT_FOUND',
  /** 400: Cloudinary atsakymo parašas neteisingas. */
  'INVALID_UPLOAD_SIGNATURE',
  /** 400: nuotrauka ne mūsų kataloge arba `secureUrl` neatitinka mūsų Cloudinary paskyros. */
  'FOREIGN_IMAGE',
  /** 409: ši nuotrauka jau pridėta. */
  'DUPLICATE_IMAGE',
  /** 409: produktas jau turi PRODUCT_IMAGE_MAX_COUNT nuotraukų. */
  'IMAGE_LIMIT_REACHED',
  /** 404: produktas tokios nuotraukos neturi. */
  'IMAGE_NOT_FOUND',
  /** 409: rikiavimo sąrašas neatitinka esamų nuotraukų (kažkas jas ką tik pakeitė). */
  'IMAGE_SET_MISMATCH',
] as const;
export type ProductImageErrorCode = (typeof PRODUCT_IMAGE_ERROR_CODES)[number];

export interface CloudinaryImageUrlOptions {
  width: number;
  height?: number;
  /** Numatyta: `fill`, jei nurodytas aukštis, kitaip `limit`. */
  crop?: 'fill' | 'fit' | 'limit' | 'pad' | 'thumb';
}

const UPLOAD_SEGMENT = '/upload/';

/**
 * Pristatymo URL iš išsaugoto Cloudinary URL: po `/upload/` įterpia transformaciją
 * (`f_auto,q_auto,c_…,w_…,h_…`). `f_auto` naršyklei parenka tinkamą formatą, todėl ir
 * HEIC nuotraukos rodomos visur. Ne Cloudinary URL grąžinamas nepakeistas.
 */
export function cloudinaryImageUrl(url: string, options: CloudinaryImageUrlOptions): string {
  const at = url.indexOf(UPLOAD_SEGMENT);
  if (at === -1) return url;
  const crop = options.crop ?? (options.height ? 'fill' : 'limit');
  const parts = ['f_auto', 'q_auto', `c_${crop}`];
  if (crop === 'fill' || crop === 'thumb') parts.push('g_auto');
  parts.push(`w_${Math.round(options.width)}`);
  if (options.height) parts.push(`h_${Math.round(options.height)}`);
  const head = url.slice(0, at + UPLOAD_SEGMENT.length);
  return `${head}${parts.join(',')}/${url.slice(at + UPLOAD_SEGMENT.length)}`;
}
