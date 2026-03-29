import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Transfer extends Document {
  @Prop()
  roomId: string;

  @Prop()
  lockerId: string;

  @Prop()
  fromUserId: string;

  @Prop()
  toUserId: string;

  @Prop()
  campusId: string;

  @Prop()
  fromScheduleId: string;

  @Prop()
  toScheduleId: string;

  @Prop()
  toBookingId: string;

  @Prop({ default: 'schedule' })
  targetType: string;

  @Prop()
  transferDate: Date;

  @Prop()
  reason: string;

  @Prop({ default: 'pending' })
  status: string;

  @Prop()
  approvedAt: Date;

  @Prop()
  activatedAt: Date;

  @Prop()
  cancelledAt: Date;

  @Prop()
  cancelReason: string;

  @Prop()
  rejectedAt: Date;

  @Prop()
  rejectReason: string;

  @Prop()
  notes: string;
}

export const TransferSchema = SchemaFactory.createForClass(Transfer);
