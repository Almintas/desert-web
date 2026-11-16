import type { ProductDto } from '@desert-web/shared';
import type { Product } from './product.schema';

export function toProductDto(p: Product): ProductDto {
  return {
    id: p._id.toString(),
    name: p.name,
    slug: p.slug,
    description: p.description,
    category: p.category,
    images: p.images.map((i) => ({ url: i.url, publicId: i.publicId })),
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
