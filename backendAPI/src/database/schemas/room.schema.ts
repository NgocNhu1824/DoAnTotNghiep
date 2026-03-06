import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RoomDocument = Room & Document;

@Schema({ timestamps: true })
export class Room {
  @Prop({ required: true, unique: true, index: true })
  roomCode: string;

  @Prop({ required: true })
  roomName: string;

  @Prop({ required: true, index: true })
  building: string;

  @Prop({ required: true, index: true })
  floor: number;

  @Prop({ required: true })
  capacity: number;

  @Prop({ required: true, index: true })
  roomType: string;

  @Prop({ type: [String], default: [] })
  facilities: string[];

  @Prop({ type: [Number], default: [] })
  blockedSlots: number[];

  @Prop({ required: true })
  lockerNumber: number;

  @Prop({ type: Types.ObjectId, ref: 'Campus', required: true, index: true })
  campusId: Types.ObjectId;

  @Prop({ 
    required: true, 
    enum: ['available', 'occupied', 'maintenance', 'reserved'], 
    default: 'available',
    index: true 
  })
  status: string;

  @Prop()
  description: string;

  @Prop({ default: true, index: true })
  isActive: boolean;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const RoomSchema = SchemaFactory.createForClass(Room);

RoomSchema.set('toJSON', { virtuals: true });
RoomSchema.set('toObject', { virtuals: true });

RoomSchema.virtual('devices', {
  ref: 'Device',
  localField: '_id',
  foreignField: 'roomId',
});
