import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({
  timestamps: true,
  collection: 'users',
})
export class User extends Document {
  @Prop({ sparse: true })
  googleId: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  fullName: string;

  @Prop()
  avatar: string;

  @Prop({ select: false })
  passwordHash: string;

  @Prop({ type: Types.ObjectId, ref: 'Role', required: true })
  roleId: Types.ObjectId;

  @Prop()
  employeeId: string;

  @Prop()
  studentId: string;

  @Prop()
  department: string;

  @Prop()
  phone: string;

  @Prop({ type: Types.ObjectId, ref: 'Campus' })
  campusId: Types.ObjectId;

  @Prop()
  faceData: string;

  @Prop()
  fingerprintData: string;

  @Prop({ default: true })
  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Indexes
UserSchema.index({ email: 1 });
UserSchema.index({ googleId: 1 });
UserSchema.index({ employeeId: 1 });
UserSchema.index({ studentId: 1 });
UserSchema.index({ roleId: 1, isActive: 1 });
UserSchema.index({ campusId: 1 });
