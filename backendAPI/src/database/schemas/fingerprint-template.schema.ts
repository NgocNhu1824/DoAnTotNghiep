import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

@Schema({
  timestamps: true,
  collection: 'fingerprint_templates',
})
export class FingerprintTemplate extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  templateData: string;

  @Prop({ default: 'as608_template_base64', index: true })
  templateEncoding?: string | null;

  @Prop({ default: null, index: true })
  fingerId?: number | null;

  @Prop({ default: null, index: true })
  deviceId?: string | null;

  @Prop({ default: 'as608' })
  provider: string;

  @Prop({ default: 'esp32' })
  source: string;

  @Prop({ default: true, index: true })
  isActive: boolean;

  @Prop({ default: null, index: true })
  templateHash?: string | null;

  createdAt: Date;
  updatedAt: Date;
}

export const FingerprintTemplateSchema = SchemaFactory.createForClass(FingerprintTemplate);

FingerprintTemplateSchema.index({ userId: 1, deviceId: 1 }, { unique: true });
FingerprintTemplateSchema.index({ userId: 1 });
FingerprintTemplateSchema.index({ deviceId: 1, fingerId: 1 });
FingerprintTemplateSchema.index({ templateHash: 1 });
FingerprintTemplateSchema.index({ templateEncoding: 1 });
