import {
  FULFILLMENT_METHODS,
  type FulfillmentMethod,
  ORDER_STATUSES,
  type OrderStatus,
  PAYMENT_STATUSES,
  type PaymentStatus,
} from '@desert-web/shared';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

@Schema({ _id: false })
export class OrderCustomer {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, trim: true })
  email!: string;

  /** lowercase + trim, naudojama limitui „vienam pirkėjui“. */
  @Prop({ required: true })
  emailNormalized!: string;

  @Prop({ required: true, trim: true })
  phone!: string;

  /** E.164 (+3706...), naudojama limitui „vienam pirkėjui“. */
  @Prop({ required: true })
  phoneNormalized!: string;
}
export const OrderCustomerSchema = SchemaFactory.createForClass(OrderCustomer);

/** Produkto pavadinimo ir kainos kopija užsakymo metu. */
@Schema({ _id: false })
export class OrderItem {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, ref: 'Product' })
  productId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  variantId!: Types.ObjectId;

  @Prop({ required: true })
  productName!: string;

  @Prop({ required: true })
  variantName!: string;

  @Prop({ required: true, min: 0 })
  unitPriceCents!: number;

  @Prop({ required: true, min: 1 })
  quantity!: number;

  @Prop({ required: true, min: 0 })
  lineTotalCents!: number;
}
export const OrderItemSchema = SchemaFactory.createForClass(OrderItem);

@Schema({ _id: false })
export class OrderFulfillment {
  @Prop({ type: String, enum: [...FULFILLMENT_METHODS], required: true })
  method!: FulfillmentMethod;

  @Prop()
  address?: string;

  @Prop()
  notes?: string;
}
export const OrderFulfillmentSchema = SchemaFactory.createForClass(OrderFulfillment);

@Schema({ _id: false })
export class OrderPayment {
  @Prop({ type: String, enum: [...PAYMENT_STATUSES], default: 'unpaid' })
  status!: PaymentStatus;

  @Prop()
  method?: string;

  @Prop()
  providerRef?: string;

  @Prop()
  paidAt?: Date;
}
export const OrderPaymentSchema = SchemaFactory.createForClass(OrderPayment);

@Schema({ collection: 'orders', timestamps: true })
export class Order {
  _id!: Types.ObjectId;

  /** "DW-2026-0042" */
  @Prop({ required: true })
  orderNumber!: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, ref: 'SaleWindow' })
  saleWindowId!: Types.ObjectId;

  @Prop({ type: OrderCustomerSchema, required: true })
  customer!: OrderCustomer;

  @Prop({ type: [OrderItemSchema], required: true })
  items!: OrderItem[];

  @Prop({ required: true, min: 0 })
  totalCents!: number;

  @Prop({ type: String, default: 'EUR' })
  currency!: 'EUR';

  @Prop({ type: OrderFulfillmentSchema, required: true })
  fulfillment!: OrderFulfillment;

  @Prop({ type: String, enum: [...ORDER_STATUSES], default: 'pending' })
  status!: OrderStatus;

  @Prop({ type: OrderPaymentSchema })
  payment?: OrderPayment;

  /** Slapta pirkėjo nuoroda į užsakymą (be paskyros). Niekada nerodom admino sąrašuose viešai. */
  @Prop({ required: true })
  accessToken!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export type OrderDocument = HydratedDocument<Order>;
export const OrderSchema = SchemaFactory.createForClass(Order);

OrderSchema.index({ orderNumber: 1 }, { unique: true });
OrderSchema.index({ accessToken: 1 }, { unique: true });
OrderSchema.index({ saleWindowId: 1, status: 1 });
OrderSchema.index({ saleWindowId: 1, 'customer.emailNormalized': 1 });
OrderSchema.index({ saleWindowId: 1, 'customer.phoneNormalized': 1 });
