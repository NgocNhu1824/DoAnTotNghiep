import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({
  timestamps: true,
  collection: 'reset_password_tokens',
})
export class ResetPasswordToken extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, index: true })
  tokenHash: string;

  @Prop({ required: true, index: true })
  expiresAt: Date;

  @Prop({ default: false, index: true })
  used: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const ResetPasswordTokenSchema =
  SchemaFactory.createForClass(ResetPasswordToken);

// Auto-remove expired tokens from MongoDB.
ResetPasswordTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
ResetPasswordTokenSchema.index({ userId: 1, used: 1 });
ResetPasswordTokenSchema.index({ tokenHash: 1, used: 1 });
