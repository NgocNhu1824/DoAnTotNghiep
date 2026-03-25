import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type LockerAccessLogDocument = LockerAccessLog & Document;

@Schema({ timestamps: true, collection: 'locker_access_logs' })
export class LockerAccessLog {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Locker', default: null, index: true })
  lockerId?: Types.ObjectId | null;

  @Prop({ required: true, index: true })
  deviceId: string;

  @Prop({ default: null })
  fingerId?: number | null;

  @Prop({ default: null })
  userId?: string | null;

  @Prop({ default: null })
  userName?: string | null;

  @Prop({ required: true, index: true })
  method: string;

  @Prop({ required: true, enum: ['success', 'failed', 'pending'], default: 'success', index: true })
  status: 'success' | 'failed' | 'pending';

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata?: Record<string, any>;
}

export const LockerAccessLogSchema = SchemaFactory.createForClass(LockerAccessLog);
