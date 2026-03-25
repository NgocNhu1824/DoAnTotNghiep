import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'schedules' })
export class Schedule extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Campus', required: true })
  campusId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Room' })
  roomId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  lecturerId: Types.ObjectId;

  @Prop({ required: true })
  dateStart: Date; // UTC midnight

  @Prop({ required: true, min: 2, max: 7 })
  dayOfWeek: number; // 2=Monday, 7=Saturday

  @Prop({
    type: String,
    enum: ['OLDSLOT', 'NEWSLOT'],
    required: true,
  })
  slotType: string;

  @Prop({ required: true })
  slotNumber: number;

  @Prop({ type: Types.ObjectId, ref: 'TimeSlot', required: false })
  timeSlotId?: Types.ObjectId;

  @Prop({ required: true })
  startTime: string; // "HH:mm" format

  @Prop({ required: true })
  endTime: string; // "HH:mm" format

  @Prop()
  classCode?: string;

  @Prop()
  subjectCode?: string;

  @Prop()
  subjectName?: string;

  @Prop()
  semester?: string;

  @Prop({
    type: String,
    enum: ['scheduled', 'ongoing', 'completed', 'cancelled'],
    default: 'scheduled',
  })
  status: string;

  @Prop({
    type: String,
    enum: ['manual', 'imported', 'api'],
    default: 'imported',
  })
  source: string;

  @Prop({ type: Boolean, default: false })
  isOnline: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;
}

export const ScheduleSchema = SchemaFactory.createForClass(Schedule);

ScheduleSchema.index(
  { campusId: 1, roomId: 1, dateStart: 1, slotNumber: 1, dayOfWeek: 1 },
  { unique: true },
);

ScheduleSchema.index(
  { campusId: 1, lecturerId: 1, dateStart: 1, slotNumber: 1, dayOfWeek: 1 },
  { unique: true },
);

// Query optimization indexes
ScheduleSchema.index({ campusId: 1, dateStart: 1 });
ScheduleSchema.index({ campusId: 1, semester: 1 });
ScheduleSchema.index({ campusId: 1, status: 1 });
ScheduleSchema.index({ campusId: 1, isOnline: 1 });
