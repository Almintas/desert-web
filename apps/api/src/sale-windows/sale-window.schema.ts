import { SALE_WINDOW_STATUSES, type SaleWindowStatus } from '@desert-web/shared';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

/**
 * Atsiėmimo vieta ir laikas bendri visiems langams (nustatymuose). Seni dokumentai dar gali
 * turėti pickupLocation / pickupFrom / pickupTo: jie nebeskaitomi ir nerašomi.
 */
@Schema({ _id: false })
export class SaleWindowFulfillment {
  @Prop({ default: true })
  pickupAvailable!: boolean;

  @Prop({ default: false })
  deliveryAvailable!: boolean;
}
export const SaleWindowFulfillmentSchema = SchemaFactory.createForClass(SaleWindowFulfillment);

@Schema({ _id: false })
export class SaleWindowItem {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, ref: 'Product' })
  productId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  variantId!: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  priceCents!: number;

  @Prop({ required: true, min: 0 })
  quantityTotal!: number;

  /** Mažinama atomiškai užsakant (sąlyga quantityAvailable >= kiekis). Niekada < 0. */
  @Prop({ required: true, min: 0 })
  quantityAvailable!: number;

  /** Seni langai šio lauko neturi: tada leidžiama (žr. giftWrapAllowedOf). */
  @Prop({ default: true })
  giftWrapAllowed?: boolean;
}
export const SaleWindowItemSchema = SchemaFactory.createForClass(SaleWindowItem);

/** Dovanų pakavimas lange. Kaina centais už vienetą; užsakymai saugo jos kopiją. */
@Schema({ _id: false })
export class SaleWindowGiftWrap {
  @Prop({ default: false })
  enabled!: boolean;

  @Prop({ default: 0, min: 0 })
  priceCents!: number;
}
export const SaleWindowGiftWrapSchema = SchemaFactory.createForClass(SaleWindowGiftWrap);

/** Seni langai be `giftWrap` skaitomi kaip išjungti. */
export function giftWrapOf(w: Pick<SaleWindow, 'giftWrap'>): SaleWindowGiftWrap {
  return { enabled: w.giftWrap?.enabled ?? false, priceCents: w.giftWrap?.priceCents ?? 0 };
}

/** Seni langai neturi `giftWrapAllowed`: numatyta reikšmė true. */
export const giftWrapAllowedOf = (item: Pick<SaleWindowItem, 'giftWrapAllowed'>): boolean =>
  item.giftWrapAllowed !== false;

@Schema({ collection: 'saleWindows', timestamps: true })
export class SaleWindow {
  _id!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ type: String, enum: [...SALE_WINDOW_STATUSES], default: 'draft' })
  status!: SaleWindowStatus;

  @Prop({ required: true })
  opensAt!: Date;

  @Prop({ required: true })
  closesAt!: Date;

  @Prop({ type: SaleWindowFulfillmentSchema, default: () => ({}) })
  fulfillment!: SaleWindowFulfillment;

  @Prop({ type: [SaleWindowItemSchema], default: [] })
  items!: SaleWindowItem[];

  /** Seni langai šio lauko neturi (žr. giftWrapOf). */
  @Prop({ type: SaleWindowGiftWrapSchema })
  giftWrap?: SaleWindowGiftWrap;

  createdAt!: Date;
  updatedAt!: Date;
}

export type SaleWindowDocument = HydratedDocument<SaleWindow>;
export const SaleWindowSchema = SchemaFactory.createForClass(SaleWindow);

SaleWindowSchema.index({ status: 1, opensAt: 1, closesAt: 1 });
