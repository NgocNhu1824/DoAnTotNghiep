import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type RoomUsageStateDocument = RoomUsageState & Document;

@Schema({ timestamps: true, collection: 'room_usage_states' })
export class RoomUsageState {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Room', required: true, unique: true, index: true })
  roomId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Locker', default: null, index: true })
  lockerId?: Types.ObjectId | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Campus', default: null, index: true })
  campusId?: Types.ObjectId | null;

  @Prop({ default: null, index: true })
  currentUserId?: string | null;

  @Prop({ default: null })
  currentUserName?: string | null;

  @Prop({ default: null })
  currentUsageType?: string | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Schedule', default: null, index: true })
  scheduleId?: Types.ObjectId | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Booking', default: null, index: true })
  bookingId?: Types.ObjectId | null;

  @Prop({ type: String, enum: ['occupied', 'vacant'], default: 'vacant', index: true })
  status: 'occupied' | 'vacant';

  @Prop({ type: Date, default: null })
  startedAt?: Date | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'AccessLog', default: null, index: true })
  lastAccessLogId?: Types.ObjectId | null;

  @Prop({ default: null })
  lastAction?: string | null;

  @Prop({ default: null })
  lastMethod?: string | null;

  @Prop({ default: null })
  lastReason?: string | null;

  @Prop({ default: null })
  updatedByUserId?: string | null;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata?: Record<string, any>;
}

export const RoomUsageStateSchema = SchemaFactory.createForClass(RoomUsageState);

RoomUsageStateSchema.index({ campusId: 1, status: 1 });
RoomUsageStateSchema.index({ lockerId: 1 });