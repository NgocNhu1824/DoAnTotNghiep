import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type IncidentStatus = 'reported' | 'in_progress' | 'resolved' | 'closed';
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentPriority = 'low' | 'medium' | 'high' | 'critical';
export type IncidentType = 'equipment_damage' | 'cleanliness' | 'safety' | 'other';

@Schema({ _id: false })
export class IncidentImage {
  @Prop({ required: true, trim: true })
  driveFileId: string;

  @Prop({ required: true, trim: true })
  fileName: string;

  @Prop({ required: true, trim: true })
  mimeType: string;

  @Prop({ type: Number })
  size?: number;

  @Prop({ default: Date.now })
  uploadedAt: Date;
}

export const IncidentImageSchema = SchemaFactory.createForClass(IncidentImage);

@Schema({ timestamps: true, collection: 'incidents' })
export class Incident extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Room', required: true, index: true })
  roomId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  reporterId?: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Campus', required: true, index: true })
  campusId: Types.ObjectId;

  @Prop({
    type: String,
    enum: ['equipment_damage', 'cleanliness', 'safety', 'other'],
    required: true,
    default: 'other',
  })
  incidentType: IncidentType;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, trim: true })
  description: string;

  @Prop({
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
    index: true,
  })
  severity: IncidentSeverity;

  @Prop({
    type: String,
    enum: ['reported', 'in_progress', 'resolved', 'closed'],
    default: 'reported',
    index: true,
  })
  status: IncidentStatus;

  @Prop({
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
    index: true,
  })
  priority: IncidentPriority;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  assignedTo?: Types.ObjectId | null;

  @Prop({ type: Date, default: Date.now, index: true })
  reportedAt: Date;

  @Prop({ type: Date, default: null })
  resolvedAt?: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  resolvedBy?: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  resolution?: string;

  @Prop({ type: [IncidentImageSchema], default: [] })
  images: IncidentImage[];

  @Prop({ type: String, enum: ['public_link', 'authenticated'], default: 'authenticated' })
  reportSource: 'public_link' | 'authenticated';

  @Prop({ trim: true, default: null })
  reporterName?: string | null;

  @Prop({ trim: true, default: null })
  reporterContact?: string | null;
}

export const IncidentSchema = SchemaFactory.createForClass(Incident);

IncidentSchema.index({ campusId: 1, status: 1, reportedAt: -1 });
IncidentSchema.index({ roomId: 1, reportedAt: -1 });
IncidentSchema.index({ incidentType: 1, severity: 1 });
