import type {
  AdminProductDto,
  AdminProductImageDto,
  ProductDto,
  PublicProductImageDto,
} from '@desert-web/shared';
import type { Product, ProductImage } from './product.schema';

/** Viešos nuotraukos (alt = produkto pavadinimas), pagrindinė pirmoji. */
export function toPublicImages(p: Pick<Product, 'name' | 'images'>): PublicProductImageDto[] {
  return (p.images ?? []).map((i) => ({
    url: i.url,
    width: i.width,
    height: i.height,
    alt: p.name,
  }));
}

export function toAdminImageDto(i: ProductImage): AdminProductImageDto {
  return {
    id: i._id.toString(),
    publicId: i.publicId,
    version: i.version,
    url: i.url,
    width: i.width,
    height: i.height,
    format: i.format,
    bytes: i.bytes,
    createdAt: i.createdAt.toISOString(),
  };
}

function baseFields(p: Product): Omit<ProductDto, 'images'> {
  return {
    id: p._id.toString(),
    name: p.name,
    slug: p.slug,
    description: p.description,
    category: p.category,
    allergens: p.allergens,
    variants: p.variants.map((v) => ({
      id: v._id.toString(),
      name: v.name,
      priceCents: v.priceCents,
    })),
    specialOrder: {
      enabled: p.specialOrder?.enabled ?? false,
      minQuantity: p.specialOrder?.minQuantity ?? 1,
    },
    isActive: p.isActive,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

/** Viešas produktas (pirkėjams). */
export function toProductDto(p: Product): ProductDto {
  return { ...baseFields(p), images: toPublicImages(p) };
}

/** Admino produktas: nuotraukos su ID ir Cloudinary duomenimis. */
export function toAdminProductDto(p: Product): AdminProductDto {
  return { ...baseFields(p), images: (p.images ?? []).map(toAdminImageDto) };
}
