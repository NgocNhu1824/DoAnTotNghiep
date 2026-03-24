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
    default: null,
  })
  lastSyncAt: Date;

  @Prop({
    default: null,
  })
  gatewayId?: string;

  @Prop({
    type: [
      {
        pin: { type: Number, required: true },
        name: { type: String, required: true },
        type: { type: String, default: 'relay' },
        state: { type: Number, enum: [0, 1], default: 0 },
      },
    ],
    default: [],
  })
  devices: {
    pin: number;
    name: string;
    type: string;
    state: 0 | 1;
  }[];

  @Prop({
    type: [
      {
        id: { type: String, required: true },
        connected: { type: Boolean, required: true },
      },
    ],
    default: [],
  })
  solenoids: { id: string; connected: boolean }[];
}

export const ESP32Schema = SchemaFactory.createForClass(ESP32);
