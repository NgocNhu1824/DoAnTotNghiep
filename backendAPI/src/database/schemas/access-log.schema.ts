import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type AccessLogDocument = AccessLog & Document;

@Schema({ timestamps: true, collection: 'access_logs' })
export class AccessLog {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Room', default: null, index: true })
  roomId?: Types.ObjectId | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Locker', default: null, index: true })
  lockerId?: Types.ObjectId | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null, index: true })
  userId?: Types.ObjectId | null;

  @Prop({ default: null })
  userName?: string | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Campus', default: null, index: true })
  campusId?: Types.ObjectId | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Schedule', default: null, index: true })
  scheduleId?: Types.ObjectId | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Booking', default: null, index: true })
  bookingId?: Types.ObjectId | null;

  @Prop({ required: true, default: 'unlock', index: true })
  action: string;

  @Prop({ required: true, index: true })
  deviceId: string;

  @Prop({ default: null })
  fingerId?: number | null;

  @Prop({ required: true, index: true })
  method: string;

  @Prop({ required: true, default: true, index: true })
  success: boolean;

  @Prop({ required: true, enum: ['success', 'failed', 'pending'], default: 'success', index: true })
  status: 'success' | 'failed' | 'pending';

  @Prop({ type: Date, default: Date.now, index: true })
  accessTime: Date;

  @Prop({ default: null })
  ipAddress?: string | null;

  @Prop({ default: null })
  location?: string | null;

  @Prop({ default: null })
  reason?: string | null;

  @Prop({ type: String, enum: ['assign', 'release', 'none'], default: 'none', index: true })
  usageEffect: 'assign' | 'release' | 'none';

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata?: Record<string, any>;
}

export const AccessLogSchema = SchemaFactory.createForClass(AccessLog);

AccessLogSchema.index({ roomId: 1, accessTime: -1 });
AccessLogSchema.index({ userId: 1, accessTime: -1 });
AccessLogSchema.index({ campusId: 1, accessTime: -1 });
AccessLogSchema.index({ lockerId: 1, accessTime: -1 });
AccessLogSchema.index({ deviceId: 1, accessTime: -1 });
AccessLogSchema.index({ action: 1, success: 1 });