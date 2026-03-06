import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'bookings' })
export class Booking extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Campus', required: true, index: true })
  campusId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Room', required: true, index: true })
  roomId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: function (this: any) {
      return this?.isNew;
    },
    index: true,
  })
  lecturerId: Types.ObjectId;

  // Legacy field kept for backward compatibility with existing bookings data
  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  requesterId?: Types.ObjectId;

  @Prop({
    required: function (this: any) {
      return this?.isNew;
    },
  })
  bookingDate: Date;

  // Legacy date range fields used by older booking documents
  @Prop()
  dateStart?: Date;

  @Prop()
  dateEnd?: Date;

  @Prop({ required: true })
  startTime: string;

  @Prop({ required: true })
  endTime: string;

  @Prop({ required: true, trim: true })
  purpose: string;

  @Prop({
    type: String,
    enum: ['pending', 'approved', 'rejected', 'cancelled', 'completed'],
    default: 'pending',
    index: true,
  })
  status: string;

  @Prop({ default: null })
  note?: string;

  // Legacy field name for note in old documents
  @Prop({ default: null })
  notes?: string;

  @Prop({ default: null })
  rejectReason?: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: function (this: any) {
      return this?.isNew;
    },
  })
  createdBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  updatedBy?: Types.ObjectId;
}

export const BookingSchema = SchemaFactory.createForClass(Booking);

BookingSchema.index({ campusId: 1, bookingDate: 1, startTime: 1 });
BookingSchema.index({ campusId: 1, lecturerId: 1, bookingDate: -1 });
BookingSchema.index({ campusId: 1, status: 1, bookingDate: -1 });
