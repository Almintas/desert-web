import { ADMIN_ROLES, type AdminRole } from '@desert-web/shared';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument, Types } from 'mongoose';

@Schema({ collection: 'admins', timestamps: true })
export class Admin {
  _id!: Types.ObjectId;

  /** Saugomas normalizuotas: trim + lowercase. */
  @Prop({ required: true, unique: true, trim: true, lowercase: true })
  email!: string;

  /** scrypt$N$r$p$salt$hash (žr. password.ts). */
  @Prop({ required: true })
  passwordHash!: string;

  @Prop({ type: String, enum: [...ADMIN_ROLES], required: true })
  role!: AdminRole;

  @Prop()
  lastLoginAt?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export type AdminDocument = HydratedDocument<Admin>;
export const AdminSchema = SchemaFactory.createForClass(Admin);
