import { SALE_WINDOW_STATUSES, type SaleWindowStatus } from '@desert-web/shared';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument, Types } from 'mongoose';

@Schema({ _id: false })
export class SaleWindowFulfillment {
  @Prop({ default: true })
  pickupAvailable!: boolean;

  @Prop()
  pickupLocation?: string;

  @Prop()
  pickupFrom?: Date;

  @Prop()
  pickupTo?: Date;

  @Prop({ default: false })
  deliveryAvailable!: boolean;
}
export const SaleWindowFulfillmentSchema = SchemaFactory.createForClass(SaleWindowFulfillment);

@Schema({ _id: false })
export class SaleWindowItem {
  @Prop({ type: Types.ObjectId, required: true, ref: 'Product' })
  productId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  variantId!: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  priceCents!: number;

  @Prop({ required: true, min: 0 })
  quantityTotal!: number;

  /** Mažinama atomiškai užsakant (sąlyga quantityAvailable >= kiekis). Niekada < 0. */
  @Prop({ required: true, min: 0 })
  quantityAvailable!: number;

  @Prop({ min: 1 })
  maxPerOrder?: number;

  @Prop({ min: 1 })
  maxPerCustomer?: number;
}
export const SaleWindowItemSchema = SchemaFactory.createForClass(SaleWindowItem);

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

  createdAt!: Date;
  updatedAt!: Date;
}

export type SaleWindowDocument = HydratedDocument<SaleWindow>;
export const SaleWindowSchema = SchemaFactory.createForClass(SaleWindow);

SaleWindowSchema.index({ status: 1, opensAt: 1, closesAt: 1 });
