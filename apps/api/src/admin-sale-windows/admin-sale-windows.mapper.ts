import {
  type AdminSaleWindowDto,
  type AdminSaleWindowItemDto,
  getSaleWindowPhase,
} from '@desert-web/shared';
import type { Product } from '../products/product.schema';
import { toPublicImages } from '../products/products.mapper';
import type { SaleWindow } from '../sale-windows/sale-window.schema';

export interface OrderStats {
  /** Neatšaukti užsakymai lange. */
  ordersCount: number;
  /** variantId -> neatšauktų užsakymų su ta preke skaičius. */
  ordersByVariant: Map<string, number>;
}

export function toAdminSaleWindowDto(
  w: SaleWindow,
  productsById: Map<string, Product>,
  stats: OrderStats,
  now: Date,
): AdminSaleWindowDto {
  const items: AdminSaleWindowItemDto[] = w.items.map((item) => {
    const product = productsById.get(item.productId.toString());
    const variant = product?.variants.find((v) => v._id.equals(item.variantId));
    const variantId = item.variantId.toString();
    return {
      productId: item.productId.toString(),
      variantId,
      productName: product?.name ?? 'Nežinomas produktas',
      productSlug: product?.slug ?? '',
      variantName: variant?.name ?? 'Nežinomas variantas',
      imageUrl: product?.images[0]?.url ?? null,
      images: product ? toPublicImages(product) : [],
      productActive: product?.isActive ?? false,
      priceCents: item.priceCents,
      quantityTotal: item.quantityTotal,
      quantityAvailable: item.quantityAvailable,
      sold: item.quantityTotal - item.quantityAvailable,
      maxPerOrder: item.maxPerOrder ?? null,
      maxPerCustomer: item.maxPerCustomer ?? null,
      ordersCount: stats.ordersByVariant.get(variantId) ?? 0,
    };
  });

  const f = w.fulfillment;
  return {
    id: w._id.toString(),
    title: w.title,
    status: w.status,
    phase: getSaleWindowPhase(w, now),
    opensAt: w.opensAt.toISOString(),
    closesAt: w.closesAt.toISOString(),
    fulfillment: {
      pickupAvailable: f?.pickupAvailable ?? false,
      pickupLocation: f?.pickupLocation ?? null,
      pickupFrom: f?.pickupFrom?.toISOString() ?? null,
      pickupTo: f?.pickupTo?.toISOString() ?? null,
      deliveryAvailable: f?.deliveryAvailable ?? false,
    },
    items,
    ordersCount: stats.ordersCount,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  };
}
