import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument, Types } from 'mongoose';

@Schema({ _id: false })
export class ProductImage {
  @Prop({ required: true })
  url!: string;

  @Prop({ required: true })
  publicId!: string;
}
export const ProductImageSchema = SchemaFactory.createForClass(ProductImage);

@Schema()
export class ProductVariant {
  _id!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, min: 0 })
  priceCents!: number;
}
export const ProductVariantSchema = SchemaFactory.createForClass(ProductVariant);

@Schema({ _id: false })
export class ProductSpecialOrder {
  @Prop({ default: false })
  enabled!: boolean;

  @Prop({ default: 1, min: 1 })
  minQuantity!: number;
}
export const ProductSpecialOrderSchema = SchemaFactory.createForClass(ProductSpecialOrder);

@Schema({ collection: 'products', timestamps: true })
export class Product {
  _id!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, unique: true, trim: true, lowercase: true })
  slug!: string;

  @Prop({ default: '' })
  description!: string;

  @Prop({ required: true, trim: true })
  category!: string;

  @Prop({ type: [ProductImageSchema], default: [] })
  images!: ProductImage[];

  @Prop({ type: [String], default: [] })
  allergens!: string[];

  @Prop({ type: [ProductVariantSchema], default: [] })
  variants!: ProductVariant[];

  @Prop({ type: ProductSpecialOrderSchema, default: () => ({}) })
  specialOrder!: ProductSpecialOrder;

  @Prop({ default: true })
  isActive!: boolean;

  /**
   * Tik konfliktui sukelti, ne duomenims. Kiekviena lango kūrimo / redagavimo transakcija
   * padidina šį lauką visiems lange nurodytiems produktams. Taip lango transakcija ir
   * produkto PUT transakcija (admin-products) rašo tą patį dokumentą, ir MongoDB vieną iš
   * jų nutraukia su WriteConflict (be to būtų „write skew“: kiekviena skaito tai, ką
   * rašo kita, bet nė viena nerašo to, ką skaito kita). Žr. AdminSaleWindowsService.
   */
  @Prop({ default: 0 })
  saleWindowLinkVersion!: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export type ProductDocument = HydratedDocument<Product>;
export const ProductSchema = SchemaFactory.createForClass(Product);

ProductSchema.index({ isActive: 1, category: 1 });
