import { SPECIAL_ORDER_STATUSES, type SpecialOrderStatus } from '@desert-web/shared';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import {
  OrderCustomer,
  OrderCustomerSchema,
  OrderFulfillment,
  OrderFulfillmentSchema,
  OrderPayment,
  OrderPaymentSchema,
} from '../orders/order.schema';

/** Produkto pavadinimo ir bazinės kainos kopija užklausos metu. */
@Schema({ _id: false })
export class SpecialOrderItem {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, ref: 'Product' })
  productId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  variantId!: Types.ObjectId;

  @Prop({ required: true })
  productName!: string;

  @Prop({ required: true })
  variantName!: string;

  @Prop({ required: true, min: 1 })
  quantity!: number;

  /** Bazinė varianto priceCents užklausos metu (galutinę kainą nustato adminas). */
  @Prop({ required: true, min: 0 })
  estimatedUnitPriceCents!: number;

  @Prop({ required: true, min: 0 })
  estimatedLineTotalCents!: number;
}
export const SpecialOrderItemSchema = SchemaFactory.createForClass(SpecialOrderItem);

/** adminId nėra, kai būseną nustatė sistema (pirkėjo pateikta užklausa). */
@Schema({ _id: false })
export class SpecialOrderStatusHistoryEntry {
  @Prop({ type: String, enum: [...SPECIAL_ORDER_STATUSES], required: true })
  status!: SpecialOrderStatus;

  @Prop({ required: true })
  at!: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Admin' })
  adminId?: Types.ObjectId;
}
export const SpecialOrderStatusHistoryEntrySchema = SchemaFactory.createForClass(
  SpecialOrderStatusHistoryEntry,
);

@Schema({ _id: false })
export class SpecialOrderConfirmation {
  /** Galutinė suma centais (gali skirtis nuo estimatedTotalCents). */
  @Prop({ required: true, min: 0 })
  totalCents!: number;

  @Prop({ trim: true })
  adminMessage?: string;

  /** Atsiėmimo laiko intervalas (UTC; adminas įveda Vilniaus laiku). */
  @Prop({ required: true })
  pickupFrom!: Date;

  @Prop({ required: true })
  pickupTo!: Date;

  @Prop({ required: true, trim: true })
  pickupLocation!: string;

  @Prop({ required: true })
  confirmedAt!: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Admin' })
  confirmedBy?: Types.ObjectId;
}
export const SpecialOrderConfirmationSchema =
  SchemaFactory.createForClass(SpecialOrderConfirmation);

@Schema({ _id: false })
export class SpecialOrderCancellation {
  @Prop({ trim: true })
  reason?: string;

  @Prop({ required: true })
  cancelledAt!: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Admin' })
  cancelledBy?: Types.ObjectId;
}
export const SpecialOrderCancellationSchema =
  SchemaFactory.createForClass(SpecialOrderCancellation);

/**
 * Speciali užklausa dideliam kiekiui. Pardavimo langų kiekių neliečia. Būsenos:
 * requested -> confirmed -> completed; requested -> rejected; requested | confirmed -> cancelled.
 */
@Schema({ collection: 'specialOrders', timestamps: true })
export class SpecialOrder {
  _id!: Types.ObjectId;

  /** "SP-2026-0007" (skaitiklis special-order-<metai>). */
  @Prop({ required: true })
  requestNumber!: string;

  @Prop({ type: OrderCustomerSchema, required: true })
  customer!: OrderCustomer;

  /**
   * Pageidaujama data „YYYY-MM-DD“ (Vilniaus kalendorius). Eilutė, ne Date: kalendorinė diena
   * nėra laiko momentas, todėl ji negali pasislinkti dėl UTC poslinkio ar vasaros laiko, o
   * leksikografinis palyginimas sutampa su chronologiniu (filtrai ir rikiavimas).
   */
  @Prop({ required: true, match: /^\d{4}-\d{2}-\d{2}$/ })
  desiredDate!: string;

  @Prop({ type: [SpecialOrderItemSchema], required: true })
  items!: SpecialOrderItem[];

  @Prop({ required: true, min: 0 })
  estimatedTotalCents!: number;

  @Prop({ type: String, default: 'EUR' })
  currency!: 'EUR';

  @Prop({ trim: true })
  customerNotes?: string;

  /** Visada { method: 'pickup' } (pristatymas lieka modelyje, bet nesiūlomas). */
  @Prop({ type: OrderFulfillmentSchema, required: true })
  fulfillment!: OrderFulfillment;

  @Prop({ type: String, enum: [...SPECIAL_ORDER_STATUSES], default: 'requested' })
  status!: SpecialOrderStatus;

  @Prop({ type: [SpecialOrderStatusHistoryEntrySchema], default: [] })
  statusHistory!: SpecialOrderStatusHistoryEntry[];

  @Prop({ type: SpecialOrderConfirmationSchema })
  confirmation?: SpecialOrderConfirmation;

  @Prop({ trim: true })
  rejectionReason?: string;

  @Prop({ type: SpecialOrderCancellationSchema })
  cancellation?: SpecialOrderCancellation;

  /** Pradžioje unpaid / on_pickup; completed pažymi paid ir paidAt. */
  @Prop({ type: OrderPaymentSchema })
  payment?: OrderPayment;

  /** Slapta pirkėjo nuoroda (be paskyros). */
  @Prop({ required: true })
  accessToken!: string;

  /** Kliento UUID (POST /special-orders idempotencija). */
  @Prop()
  clientRequestId?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export type SpecialOrderDocument = HydratedDocument<SpecialOrder>;
export const SpecialOrderSchema = SchemaFactory.createForClass(SpecialOrder);

SpecialOrderSchema.index({ requestNumber: 1 }, { unique: true });
SpecialOrderSchema.index({ accessToken: 1 }, { unique: true });
SpecialOrderSchema.index(
  { clientRequestId: 1 },
  { unique: true, partialFilterExpression: { clientRequestId: { $type: 'string' } } },
);
SpecialOrderSchema.index({ status: 1, desiredDate: 1 });
