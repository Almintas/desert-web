import { z } from 'zod';
import { SLUG_PATTERN } from '../slug';
import { objectIdSchema } from './common';
import type { AdminProductImageDto, PublicProductImageDto } from './product-image';

const priceCentsSchema = z
  .number({ error: 'Įvesk kainą' })
  .int('Kaina turi būti nurodyta centais')
  .nonnegative('Kaina negali būti neigiama');

export const productVariantInputSchema = z.object({
  name: z.string().trim().min(1, 'Įvesk varianto pavadinimą').max(100, 'Per ilgas pavadinimas'),
  priceCents: priceCentsSchema,
});

export const productInputSchema = z.object({
  name: z.string().trim().min(1, 'Įvesk pavadinimą').max(120, 'Per ilgas pavadinimas'),
  slug: z
    .string()
    .trim()
    .min(1, 'Įvesk adresą (slug)')
    .max(120, 'Per ilgas adresas')
    .regex(SLUG_PATTERN, 'Tik mažosios raidės, skaičiai ir brūkšneliai'),
  description: z.string().trim().max(5000, 'Per ilgas aprašymas').default(''),
  category: z.string().trim().min(1, 'Įvesk kategoriją').max(60, 'Per ilga kategorija'),
  allergens: z
    .array(z.string().trim().min(1, 'Tuščias alergenas').max(60, 'Per ilgas alergenas'))
    .max(30, 'Per daug alergenų')
    .default([]),
  variants: z.array(productVariantInputSchema).min(1, 'Reikia bent vieno varianto'),
  specialOrder: z
    .object({
      enabled: z.boolean(),
      minQuantity: z
        .number({ error: 'Įvesk skaičių' })
        .int('Turi būti sveikasis skaičius')
        .positive('Turi būti bent 1'),
    })
    .default({ enabled: false, minQuantity: 1 }),
  isActive: z.boolean().default(true),
});
export type ProductInput = z.infer<typeof productInputSchema>;

/**
 * Admino variantas: `id` yra esamo varianto ID (atnaujinamas vietoje, ID išlieka),
 * be `id` sukuriamas naujas variantas.
 */
export const adminProductVariantInputSchema = productVariantInputSchema.extend({
  id: objectIdSchema.optional(),
});
export type AdminProductVariantInput = z.infer<typeof adminProductVariantInputSchema>;

/**
 * POST / PUT /admin/products. Be `images`: nuotraukos tvarkomos atskirais maršrutais
 * (Cloudinary, žr. product-image.ts), todėl PUT esamų nuotraukų neliečia.
 */
export const adminProductInputSchema = productInputSchema
  .extend({
    variants: z
      .array(adminProductVariantInputSchema)
      .min(1, 'Reikia bent vieno varianto')
      .max(50, 'Per daug variantų'),
  })
  .superRefine((p, ctx) => {
    const seen = new Set<string>();
    p.variants.forEach((v, i) => {
      if (!v.id) return;
      if (seen.has(v.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['variants', i, 'id'],
          message: 'Tas pats variantas kartojasi',
        });
      }
      seen.add(v.id);
    });
  });
export type AdminProductInput = z.infer<typeof adminProductInputSchema>;

/** API atsakymas: ID kaip string, datos kaip ISO string. */
export interface ProductVariantDto {
  id: string;
  name: string;
  priceCents: number;
}

export interface ProductDto {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  /** Pagrindinė nuotrauka pirmoji. */
  images: PublicProductImageDto[];
  allergens: string[];
  variants: ProductVariantDto[];
  specialOrder: { enabled: boolean; minQuantity: number };
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** /admin/products atsakymas: nuotraukos su ID (pagrindinė pirmoji). */
export interface AdminProductDto extends Omit<ProductDto, 'images'> {
  images: AdminProductImageDto[];
}

/** Klaidų kodai, kuriuos grąžina /admin/products (laukas `code` klaidos atsakyme). */
export const PRODUCT_ERROR_CODES = [
  'PRODUCT_NOT_FOUND',
  /** 409: slug jau naudojamas kito produkto. */
  'SLUG_TAKEN',
  /** 400: varianto `id` nepriklauso šiam produktui. */
  'VARIANT_NOT_FOUND',
  /** 409: šalinamas variantas naudojamas juodraštiniame ar dar nesibaigusiame lange. */
  'VARIANT_IN_USE',
] as const;
export type ProductErrorCode = (typeof PRODUCT_ERROR_CODES)[number];

/** 409 VARIANT_IN_USE atsakymo papildomi laukai. */
export interface VariantInUseErrorBody {
  code: 'VARIANT_IN_USE';
  message: string;
  variantIds: string[];
  saleWindows: { id: string; title: string }[];
}
