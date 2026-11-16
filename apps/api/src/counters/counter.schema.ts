import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/** Numeracijai: { _id: "order-2026", seq: 42 } -> "DW-2026-0042". */
@Schema({ collection: 'counters', versionKey: false })
export class Counter {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ required: true, default: 0 })
  seq!: number;
}

export const CounterSchema = SchemaFactory.createForClass(Counter);
