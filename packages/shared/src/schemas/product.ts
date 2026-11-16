import { z } from 'zod';
import { centsSchema, imageSchema } from './common';

export const productVariantInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  priceCents: centsSchema,
});

export const productInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Tik mažosios raidės, skaičiai ir brūkšneliai'),
  description: z.string().trim().max(5000).default(''),
  category: z.string().trim().min(1).max(60),
  images: z.array(imageSchema).max(12).default([]),
  allergens: z.array(z.string().trim().min(1)).default([]),
  variants: z.array(productVariantInputSchema).min(1, 'Reikia bent vieno varianto'),
  specialOrder: z
    .object({
      enabled: z.boolean(),
      minQuantity: z.number().int().positive(),
    })
    .default({ enabled: false, minQuantity: 1 }),
  isActive: z.boolean().default(true),
});
export type ProductInput = z.infer<typeof productInputSchema>;

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
  images: { url: string; publicId: string }[];
  allergens: string[];
  variants: ProductVariantDto[];
  specialOrder: { enabled: boolean; minQuantity: number };
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
