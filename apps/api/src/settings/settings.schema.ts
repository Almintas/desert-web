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
 * Parduotuvės nustatymai: vienas dokumentas `_id: 'global'`. Kuriamas tingiai (pirmą kartą
 * adminui atidarius ar išsaugojus nustatymus); kol jo nėra, galioja numatytosios reikšmės.
 */
@Schema({ collection: 'settings', timestamps: true, versionKey: false })
export class Settings {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: SpecialOrderSettingsFieldsSchema, default: () => ({}) })
  specialOrders!: SpecialOrderSettingsFields;

  createdAt!: Date;
  updatedAt!: Date;
}

export type SettingsDocument = HydratedDocument<Settings>;
export const SettingsSchema = SchemaFactory.createForClass(Settings);
