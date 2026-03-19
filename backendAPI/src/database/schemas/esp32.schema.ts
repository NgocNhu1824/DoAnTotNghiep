import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ESP32Document = ESP32 & Document;

@Schema({
  timestamps: true,
})
export class ESP32 {
  @Prop({
    required: true,
    unique: true,
    index: true,
  })
  deviceId: string; // Unique identifier of ESP32 device

  @Prop({
    default: 'OFFLINE',
    enum: ['ONLINE', 'OFFLINE'],
  })
  status: string;

  @Prop({
    default: null,
  })
  lastHeartbeat: Date;

  @Prop({
    type: [{
      id: { type: String, required: true },
      connected: { type: Boolean, required: true },
    }],
    default: [],
  })
  solenoids: { id: string; connected: boolean }[];
}

export const ESP32Schema = SchemaFactory.createForClass(ESP32);
