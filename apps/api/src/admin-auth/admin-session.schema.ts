import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Schema({ collection: 'adminSessions', timestamps: { createdAt: true, updatedAt: false } })
export class AdminSession {
  _id!: Types.ObjectId;

  /** SHA-256 (hex) nuo sesijos tokeno. Pats tokenas niekur nesaugomas. */
  @Prop({ required: true })
  tokenHash!: string;

  @Prop({ type: Types.ObjectId, required: true, ref: 'Admin' })
  adminId!: Types.ObjectId;

  /** TTL indeksas ištrina pasibaigusias sesijas (ne iškart, todėl tikrinam ir užklausoje). */
  @Prop({ required: true })
  expiresAt!: Date;

  createdAt!: Date;
}

export const AdminSessionSchema = SchemaFactory.createForClass(AdminSession);

AdminSessionSchema.index({ tokenHash: 1 }, { unique: true });
AdminSessionSchema.index({ adminId: 1 });
AdminSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
