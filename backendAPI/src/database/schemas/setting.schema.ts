import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

export type SettingValueType = 'string' | 'number' | 'boolean' | 'json';

@Schema({ timestamps: true, collection: 'settings' })
export class Setting extends Document {
  @Prop({ required: true, trim: true })
  key: string;

  @Prop({ type: SchemaTypes.Mixed, required: true })
  value: any;

  @Prop({ type: String, enum: ['string', 'number', 'boolean', 'json'] })
  valueType?: SettingValueType;

  @Prop({ type: Types.ObjectId, ref: 'Campus', default: null })
  campusId?: Types.ObjectId | null;

  @Prop({ trim: true, default: 'general' })
  category: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  updatedBy?: Types.ObjectId | null;
}

export const SettingSchema = SchemaFactory.createForClass(Setting);

SettingSchema.index({ key: 1, campusId: 1 }, { unique: true });
SettingSchema.index({ category: 1, campusId: 1 });
SettingSchema.index({ key: 1, isActive: 1 });
