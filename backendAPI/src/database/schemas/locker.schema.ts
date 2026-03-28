import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { LockerStatus } from '@/common/enums';

@Schema({ timestamps: true, collection: 'lockers' })
export class Locker extends Document {
  @Prop({ required: true, unique: true })
  lockerNumber: number;

  @Prop({ required: true })
  position: string;

  @Prop({ default: null })
  deviceId?: string;

  @Prop({ default: null })
  controlPin?: number | null;

  @Prop({ type: Types.ObjectId, ref: 'ESP32', default: null })
  esp32Id?: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Campus', default: null })
  campusId?: Types.ObjectId | null;

  @Prop({
    type: String,
    enum: Object.values(LockerStatus),
    default: LockerStatus.AVAILABLE,
  })
  status: LockerStatus;

  @Prop({ default: 100 })
  batteryLevel: number;

  @Prop({ default: null })
  lastConnection: Date | null;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Types.ObjectId, ref: 'Room', default: null })
  roomId?: Types.ObjectId | null;

  @Prop({ default: 'Unmapped' })
  roomName?: string;
}

export const LockerSchema = SchemaFactory.createForClass(Locker);
