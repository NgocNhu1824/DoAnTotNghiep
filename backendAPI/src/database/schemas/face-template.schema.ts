import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({
  timestamps: true,
  collection: 'face_templates',
})
export class FaceTemplate extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true })
  templateHash: string;

  @Prop({ type: [Number], required: true })
  embedding: number[];

  @Prop({ type: Number, required: true, min: 0, default: 1 })
  embeddingNorm: number;

  @Prop({ default: 'embedding-v1' })
  algorithm: string;

  @Prop({ default: 'camera' })
  source: string;

  @Prop({ type: Number, min: 0, max: 100, default: null })
  qualityScore?: number | null;

  createdAt: Date;
  updatedAt: Date;
}

export const FaceTemplateSchema = SchemaFactory.createForClass(FaceTemplate);

FaceTemplateSchema.index({ userId: 1 }, { unique: true });
FaceTemplateSchema.index({ templateHash: 1 }, { unique: true });
