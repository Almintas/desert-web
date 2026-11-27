import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

/** Vienintelio nustatymų dokumento ID. */
export const GLOBAL_SETTINGS_ID = 'global';

@Schema({ _id: false })
export class SpecialOrderSettingsFields {
  @Prop({ default: false })
  enabled!: boolean;

  @Prop({ default: 7, min: 0, max: 60 })
  leadTimeDays!: number;

  @Prop({ default: 90, min: 1, max: 365 })
  maxDaysAhead!: number;
}
export const SpecialOrderSettingsFieldsSchema = SchemaFactory.createForClass(
  SpecialOrderSettingsFields,
);

/**
 * Parduotuvės informacija. Laukai be numatytųjų reikšmių: kol jų nėra (dokumentas dar
 * neišsaugotas), skaitant naudojamos DEFAULT_SHOP_INFO (žr. SettingsService). Tuščia eilutė
 * yra tikra reikšmė („nerodoma“).
 */
@Schema({ _id: false })
export class ShopSellerFields {
  @Prop() name?: string;
  @Prop() businessId?: string;
  @Prop() address?: string;
  @Prop() email?: string;
  @Prop() phone?: string;
}

@Schema({ _id: false })
export class ShopSocialFields {
  @Prop() facebook?: string;
  @Prop() instagram?: string;
  @Prop() tiktok?: string;
}

@Schema({ _id: false })
export class ShopTextsFields {
  @Prop() tagline?: string;
  @Prop() subtagline?: string;
}

@Schema({ _id: false })
export class ShopFields {
  @Prop({ type: SchemaFactory.createForClass(ShopSellerFields) })
  seller?: ShopSellerFields;

  @Prop({ type: SchemaFactory.createForClass(ShopSocialFields) })
  social?: ShopSocialFields;

  @Prop({ type: SchemaFactory.createForClass(ShopTextsFields) })
  texts?: ShopTextsFields;
}
export const ShopFieldsSchema = SchemaFactory.createForClass(ShopFields);

/** Atsiėmimo vieta ir laikas (laisvas tekstas). Kol nėra: defaultPickupInfo (SettingsService). */
@Schema({ _id: false })
export class PickupFields {
  @Prop() location?: string;
  @Prop() hours?: string;
}
export const PickupFieldsSchema = SchemaFactory.createForClass(PickupFields);

/**
 * Parduotuvės nustatymai: vienas dokumentas `_id: 'global'`. Kuriamas tingiai (pirmą kartą
 * adminui atidarius ar išsaugojus nustatymus); kol jo nėra, galioja numatytosios reikšmės.
 */
@Schema({ collection: 'settings', timestamps: true, versionKey: false })
export class Settings {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: SpecialOrderSettingsFieldsSchema, default: () => ({}) })
  specialOrders!: SpecialOrderSettingsFields;

  /** Nėra, kol owner parduotuvės informacijos neišsaugojo (galioja DEFAULT_SHOP_INFO). */
  @Prop({ type: ShopFieldsSchema })
  shop?: ShopFields;

  /** Nėra, kol owner atsiėmimo informacijos neišsaugojo (galioja defaultPickupInfo). */
  @Prop({ type: PickupFieldsSchema })
  pickup?: PickupFields;

  createdAt!: Date;
  updatedAt!: Date;
}

export type SettingsDocument = HydratedDocument<Settings>;
export const SettingsSchema = SchemaFactory.createForClass(Settings);
