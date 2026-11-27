import {
  type CurrentSaleWindowResponse,
  getSaleWindowPhase,
  type PublicSaleWindowDto,
  type PublicSaleWindowItemDto,
} from '@desert-web/shared';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Product } from '../products/product.schema';
import { toPublicImages } from '../products/products.mapper';
import { giftWrapAllowedOf, giftWrapOf, SaleWindow } from './sale-window.schema';

@Injectable()
export class SaleWindowsService {
  constructor(
    @InjectModel(SaleWindow.name) private readonly saleWindowModel: Model<SaleWindow>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
  ) {}

  /** Visi atidaryti langai ir artimiausias būsimas langas. */
  async getCurrent(now: Date = new Date()): Promise<CurrentSaleWindowResponse> {
    const [open, upcoming] = await Promise.all([
      this.saleWindowModel
        .find({ status: 'published', opensAt: { $lte: now }, closesAt: { $gt: now } })
        .sort({ opensAt: 1, _id: 1 })
        .lean<SaleWindow[]>()
        .exec(),
      this.saleWindowModel
        .findOne({ status: 'published', opensAt: { $gt: now } })
        .sort({ opensAt: 1, _id: 1 })
        .lean<SaleWindow>()
        .exec(),
    ]);

    const openWindows = await Promise.all(open.map((w) => this.toPublicDto(w, now)));
    return {
      open: openWindows[0] ?? null,
      openWindows,
      upcoming: upcoming ? await this.toPublicDto(upcoming, now) : null,
    };
  }

  private async toPublicDto(window: SaleWindow, now: Date): Promise<PublicSaleWindowDto> {
    const productIds = [...new Set(window.items.map((i) => i.productId.toString()))];
    const products = await this.productModel
      .find({ _id: { $in: productIds } })
      .lean<Product[]>()
      .exec();
    const productsById = new Map(products.map((p) => [p._id.toString(), p]));

    const items: PublicSaleWindowItemDto[] = [];
    for (const item of window.items) {
      const product = productsById.get(item.productId.toString());
      const variant = product?.variants.find((v) => v._id.equals(item.variantId));
      if (!product || !variant) continue; // produktas ištrintas: nerodom

      items.push({
        productId: product._id.toString(),
        variantId: variant._id.toString(),
        productName: product.name,
        productSlug: product.slug,
        variantName: variant.name,
        description: product.description ?? '',
        allergens: product.allergens ?? [],
        imageUrl: product.images[0]?.url ?? null,
        images: toPublicImages(product),
        priceCents: item.priceCents,
        quantityAvailable: item.quantityAvailable,
        maxPerOrder: item.maxPerOrder ?? null,
        giftWrapAllowed: giftWrapAllowedOf(item),
      });
    }

    const f = window.fulfillment;
    const giftWrap = giftWrapOf(window);
    return {
      id: window._id.toString(),
      title: window.title,
      phase: getSaleWindowPhase(window, now),
      opensAt: window.opensAt.toISOString(),
      closesAt: window.closesAt.toISOString(),
      fulfillment: {
        pickupAvailable: f?.pickupAvailable ?? false,
        deliveryAvailable: f?.deliveryAvailable ?? false,
      },
      // Kaina viešai rodoma tik kai pakavimas įjungtas.
      giftWrap: giftWrap.enabled ? { priceCents: giftWrap.priceCents } : null,
      items,
    };
  }
}
